"use client";

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { toast } from "sonner";
import { fetchLatestJob } from "@/lib/api";
import type { LatestJob } from "@/lib/schemas";

const WATCHED_JOB_KEY = "dhan:watched-job";
const TOASTED_JOB_KEY = "dhan:toasted-job";
const POLL_INTERVAL_MS = 2500;

type JobStatusContextValue = {
  running: boolean;
  latestJob: LatestJob | null;
  lastCompletedJob: LatestJob | null;
  markJobStarted: () => void;
  resyncJobStatus: () => void;
};

const JobStatusContext = createContext<JobStatusContextValue | null>(null);

export function useJobStatus(): JobStatusContextValue {
  const ctx = useContext(JobStatusContext);
  if (!ctx) {
    throw new Error("useJobStatus must be used within JobStatusProvider");
  }
  return ctx;
}

function getSessionItem(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function setSessionItem(key: string, value: string) {
  try {
    sessionStorage.setItem(key, value);
  } catch {
    // ignore quota / private mode
  }
}

function removeSessionItem(key: string) {
  try {
    sessionStorage.removeItem(key);
  } catch {
    // ignore
  }
}

function toastForCompletedJob(job: LatestJob): boolean {
  const toastedId = getSessionItem(TOASTED_JOB_KEY);
  if (toastedId === job.id) return false;

  if (job.status === "succeeded") {
    const description =
      job.error_count > 0
        ? `Updated ${job.symbol_count} stocks · ${job.error_count} errors`
        : `Updated ${job.symbol_count} stocks`;
    toast.success("Strategy run finished", { description });
  } else if (job.status === "failed") {
    toast.error("Strategy run failed");
  } else {
    return false;
  }

  setSessionItem(TOASTED_JOB_KEY, job.id);
  removeSessionItem(WATCHED_JOB_KEY);
  return true;
}

function isTerminalStatus(status: string): boolean {
  return status === "succeeded" || status === "failed";
}

export function JobStatusProvider({ children }: { children: ReactNode }) {
  const [latestJob, setLatestJob] = useState<LatestJob | null>(null);
  const [running, setRunning] = useState(false);
  const [lastCompletedJob, setLastCompletedJob] = useState<LatestJob | null>(
    null
  );

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const latestJobRef = useRef<LatestJob | null>(null);
  const prevStatusRef = useRef<string | null>(null);
  const expectRunRef = useRef(false);
  const knownBeforeStartRef = useRef<string | null>(null);

  function stopPolling() {
    if (intervalRef.current != null) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }

  function startPolling() {
    if (intervalRef.current != null) return;
    intervalRef.current = setInterval(() => {
      void pollOnce();
    }, POLL_INTERVAL_MS);
  }

  function finishWatching(job: LatestJob) {
    const toasted = toastForCompletedJob(job);
    if (toasted || getSessionItem(TOASTED_JOB_KEY) === job.id) {
      setLastCompletedJob(job);
    }
    expectRunRef.current = false;
    setRunning(false);
    stopPolling();
  }

  function handleJob(job: LatestJob | null) {
    latestJobRef.current = job;
    setLatestJob(job);

    if (!job) {
      prevStatusRef.current = null;
      if (!expectRunRef.current) {
        setRunning(false);
        stopPolling();
      }
      return;
    }

    if (job.status === "running") {
      expectRunRef.current = false;
      setRunning(true);
      setSessionItem(WATCHED_JOB_KEY, job.id);
      prevStatusRef.current = "running";
      return;
    }

    const watchedId = getSessionItem(WATCHED_JOB_KEY);
    const prev = prevStatusRef.current;

    // markJobStarted fired, but this poll still shows the previous terminal job
    if (expectRunRef.current) {
      if (
        isTerminalStatus(job.status) &&
        job.id !== knownBeforeStartRef.current
      ) {
        // New job finished before we observed "running"
        prevStatusRef.current = job.status;
        finishWatching(job);
        return;
      }
      prevStatusRef.current = job.status;
      return;
    }

    if (isTerminalStatus(job.status)) {
      const transitionedFromRunning = prev === "running";
      const remountCatchup =
        prev == null &&
        watchedId === job.id &&
        getSessionItem(TOASTED_JOB_KEY) !== job.id;

      if (transitionedFromRunning || remountCatchup) {
        finishWatching(job);
      } else {
        setRunning(false);
        stopPolling();
      }
    }

    prevStatusRef.current = job.status;
  }

  async function pollOnce() {
    try {
      const job = await fetchLatestJob();
      handleJob(job);
    } catch {
      // Keep polling through transient errors
    }
  }

  function markJobStarted() {
    knownBeforeStartRef.current = latestJobRef.current?.id ?? null;
    expectRunRef.current = true;
    setRunning(true);
    startPolling();
    void pollOnce();
  }

  function resyncJobStatus() {
    expectRunRef.current = false;
    void pollOnce();
  }

  useEffect(() => {
    let cancelled = false;

    async function boot() {
      try {
        const job = await fetchLatestJob();
        if (cancelled) return;
        handleJob(job);
        if (job?.status === "running") {
          startPolling();
        }
      } catch {
        // ignore initial fetch failure
      }
    }

    void boot();

    return () => {
      cancelled = true;
      stopPolling();
    };
  }, []);

  return (
    <JobStatusContext.Provider
      value={{
        running,
        latestJob,
        lastCompletedJob,
        markJobStarted,
        resyncJobStatus,
      }}
    >
      {children}
    </JobStatusContext.Provider>
  );
}
