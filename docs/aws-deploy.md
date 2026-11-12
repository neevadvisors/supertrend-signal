# AWS deploy guide (v1)

Verbose runbook for the first AWS deploy of this monorepo: **one EC2** (api + worker + frontend + Nginx) and **private RDS Postgres** in **`ap-south-1`**, provisioned with Terraform, app releases via [`deploy/deploy.sh`](../deploy/deploy.sh).

Hardening (HTTPS, remote state, RDS backups, SSM, etc.) lives in [`aws-ec2-hardening-followup.md`](aws-ec2-hardening-followup.md) — do not expand that into v1.

## Architecture (what you get)

```text
Browser ──HTTP :80──▶ Nginx (on EC2)
                        ├─ /api/auth/*  → frontend (Next.js :3000)
                        ├─ /api/*       → api (FastAPI :8000)
                        ├─ /health      → api
                        └─ /            → frontend

api + worker ──5432/ssl──▶ RDS Postgres (private, same VPC)
```

| Piece | Owner |
|-------|--------|
| VPC/SG/EC2/EIP/RDS/key pair | **Terraform** |
| Docker, git, swap, `/opt/neev-signals` | **user_data** (first boot only) |
| git sync, `.env`, image build/up, health check | **`deploy/deploy.sh`** (repeatable) |

Terraform does **not** deploy app code. Editing `user_data` later does **nothing** to a running instance unless Terraform **replaces** that instance.

## Prerequisites

1. **AWS account** with permission to manage EC2, Elastic IP, RDS, security groups, and key pairs in `ap-south-1`.
2. **AWS CLI** configured. Confirm:

   ```bash
   aws sts get-caller-identity
   aws configure get region   # prefer ap-south-1
   ```

3. **Terraform CLI** matching [`infra/terraform/versions.tf`](../infra/terraform/versions.tf) (`required_version = "~> 1.9"`). This repo commits `.terraform.lock.hcl` (AWS provider `~> 5.0`).

   ```bash
   brew install terraform   # or tfenv
   terraform version
   ```

4. **SSH keypair on your laptop** (dedicated key recommended):

   ```bash
   ssh-keygen -t ed25519 -C "neev-signals-aws" -f ~/.ssh/neev_signals_aws
   ```

   Terraform registers **only the public key** (`aws_key_pair`). Never generate a private key with the Terraform `tls` provider into state.

5. **Your public IP** for SSH allowlisting (`admin_cidr`):

   ```bash
   curl -s https://checkip.amazonaws.com
   # use as x.x.x.x/32 in terraform.tfvars
   ```

   If your ISP IP changes later, update `admin_cidr` and re-apply (updates the security group; does not rebuild the stack).

6. **Secrets on hand**
   - App: `DHAN_CLIENT_ID`, `DHAN_PIN`, `DHAN_TOTP_SECRET`, optional `DHAN_ACCESS_TOKEN`, `ALPACA_*`, `US_MARKET_ENABLED`
   - UI login: `AUTH_USERNAME`, `AUTH_PASSWORD`, `AUTH_SECRET`
   - RDS master password (same value in `terraform.tfvars` and later in `DATABASE_URL`)

7. **Optional locally:** Docker, to smoke-test image builds before first on-box deploy. On EC2, you need a way to get this repo onto the instance (git HTTPS + token, deploy key, or `scp` a tarball).

## Terraform variables and state

Copy and fill (gitignored):

```bash
cd infra/terraform
cp terraform.tfvars.example terraform.tfvars
```

Required in `terraform.tfvars`:

| Variable | Meaning |
|----------|---------|
| `ssh_public_key_path` | Path to pubkey, e.g. `~/.ssh/neev_signals_aws.pub` |
| `admin_cidr` | Your laptop public IP as `/32` (SSH only) |
| `db_password` | RDS master password (`sensitive`) |

Defaults (override only if needed): `region = "ap-south-1"`, `instance_type = "t3.small"`, `db_instance_class = "db.t4g.micro"`, DB name/user `signals`.

**State warning:** even with `sensitive = true`, `db_password` is stored in **local** `terraform.tfstate` in plaintext on disk. Do not commit state (already gitignored). Protect the file like a secret.

## Provision infra

```bash
cd infra/terraform
terraform init
terraform fmt -recursive
terraform validate
terraform plan -out tfplan
# Read the plan carefully, then:
terraform apply tfplan
terraform output
```

Useful outputs:

| Output | Use |
|--------|-----|
| `eip_public_ip` | Stable public IPv4 (app + SSH host) |
| `app_url` | `http://<eip>` |
| `rds_endpoint` | Hostname for `DATABASE_URL` (private; only from EC2) |
| `ssh_command` | Hint using your private key path |

### What gets created

- Default VPC lookup + security groups (SSH from `admin_cidr`, HTTP `:80` public, RDS `:5432` only from EC2 SG)
- Key pair from your public key
- Ubuntu 24.04 EC2 (`t3.small` by default), gp3 root volume, **EIP** association
- RDS Postgres 16 (`publicly_accessible = false`), v1 `skip_final_snapshot = true`

EC2 AMI is ignored on later plans (`lifecycle.ignore_changes = [ami]`) so a newer matching AMI does not force replacement.

### First boot (user_data)

SSH in (Ubuntu AMI → user `ubuntu`):

```bash
ssh -i ~/.ssh/neev_signals_aws ubuntu@<eip_public_ip>
```

Optional `~/.ssh/config` (after you know the EIP):

```text
Host neev-signals
  HostName <eip_public_ip>
  User ubuntu
  IdentityFile ~/.ssh/neev_signals_aws
  IdentitiesOnly yes
```

On the instance:

```bash
cloud-init status --wait
sudo tail -n 100 /var/log/user-data.log
docker --version
docker compose version
ls -la /opt/neev-signals
```

Bootstrap installs Docker Engine + Compose plugin, git, ~2 GiB swap, and creates `/opt/neev-signals` owned by `ubuntu`. It does **not** clone the app or write `.env` files.

If you are not in the `docker` group in this SSH session yet, log out/in once (or `newgrp docker`).

## First app deploy

### 1. Put the repo on the instance

Example (HTTPS; use a PAT/deploy key as needed):

```bash
sudo chown ubuntu:ubuntu /opt/neev-signals
cd /opt/neev-signals
git clone <your-repo-url> .
# or: git clone <url> /opt/neev-signals
```

### 2. Backend env (`/opt/neev-signals/backend/.env`)

Mode ideally `600`. Minimum for AWS:

```bash
cp backend/.env.example backend/.env
chmod 600 backend/.env
```

Set at least:

```text
DHAN_CLIENT_ID=...
DHAN_PIN=...
DHAN_TOTP_SECRET=...
CORS_ORIGINS=http://<ElasticIP>
DATABASE_URL=postgresql+psycopg://signals:<password>@<rds_endpoint>:5432/signals?sslmode=require
US_MARKET_ENABLED=false
```

Notes:

- URL-encode special characters in the password.
- **`sslmode=require` is mandatory** for RDS. `deploy.sh` refuses to continue without it.
- Username/DB name must match Terraform (`signals` / `signals` unless you overrode them).
- Add Alpaca keys if `US_MARKET_ENABLED=true`.

### 3. Frontend env (`/opt/neev-signals/frontend/.env`)

```bash
cp frontend/.env.example frontend/.env
chmod 600 frontend/.env
```

```text
AUTH_USERNAME=...
AUTH_PASSWORD=...
AUTH_SECRET=...   # long random string
# AUTH_COOKIE_SECURE=true   # only after HTTPS
```

`NEXT_PUBLIC_API_URL` is a **build-time** arg (Compose/build). `deploy.sh` sets it from instance public IPv4 metadata when unset (should match the EIP). You can also export it explicitly:

```bash
export NEXT_PUBLIC_API_URL=http://<ElasticIP>
```

### 4. Run deploy

```bash
cd /opt/neev-signals
./deploy/deploy.sh
```

This builds images, starts Compose (`docker-compose.aws.yml`), and waits for `http://127.0.0.1/health` via Nginx.

**Migrations:** Alembic runs in the **api** container entrypoint only (not worker, not `deploy.sh`). Do not add a second migrate step.

Optional one-shot coverage job:

```bash
docker compose -f docker-compose.aws.yml run --rm api job -- --market ALL
```

## Nginx routing (same host)

| Path | Upstream |
|------|----------|
| `/api/auth/` | frontend (login/logout) |
| `/api/` | api (FastAPI) |
| `/health`, `/docs`, `/openapi.json` | api |
| `/` | frontend |

v1 is **HTTP only** on `:80`. Session cookies stay non-`Secure` until you set `AUTH_COOKIE_SECURE=true` behind HTTPS (follow-up doc).

## Verification checklist

- [ ] `terraform output` shows EIP, `app_url`, RDS endpoint
- [ ] `cloud-init status` finished; `/var/log/user-data.log` clean
- [ ] `docker compose -f docker-compose.aws.yml ps` — api, worker, frontend, nginx up; api healthy
- [ ] `curl -fsS http://<EIP>/health` → ok
- [ ] UI loads at `http://<EIP>/` and login works
- [ ] UI can call API (instruments / meta / signals)
- [ ] Worker logs show supercronic schedules: `docker compose -f docker-compose.aws.yml logs worker --tail=50`
- [ ] Inside api: migrations at head (entrypoint already ran `alembic upgrade head`)
- [ ] Optional: on RDS, session shows SSL in use

## Day-2 operations

**Redeploy app code** (after `git pull` / merge on the instance):

```bash
cd /opt/neev-signals
./deploy/deploy.sh
```

Rebuild frontend whenever the public base URL changes (EIP change is rare; if it happens, rebuild so `NEXT_PUBLIC_API_URL` matches).

**SSH IP changed:**

```bash
# laptop: update admin_cidr in terraform.tfvars
cd infra/terraform
terraform plan -out tfplan
terraform apply tfplan
```

**Inspect without changing infra:** prefer AWS CLI / Console / read-only AWS MCP after a successful apply. Do **not** create or edit Terraform-managed resources by hand or via MCP write tools — that causes drift. Fix drift by changing `.tf` and re-applying.

## Teardown / cost notes

```bash
cd infra/terraform
terraform destroy
```

v1 RDS uses `skip_final_snapshot = true` and `backup_retention_period = 0`. **Destroy deletes the database with no snapshot.** Expected for learning; production retention is follow-up hardening.

Other cost notes:

- Rough ongoing cost ≈ **EC2 small + RDS micro + public IPv4**.
- Elastic IPv4 can incur charges when **unattached** — destroy cleanly or release EIPs.
- Avoid adding NAT gateways for this default-VPC design.

## Local vs AWS Compose

| | `docker-compose.yml` (laptop) | `docker-compose.aws.yml` (EC2) |
|--|-------------------------------|--------------------------------|
| Postgres | Local container | External RDS |
| Backend code | Bind-mounted | Baked into image |
| Public ports | api `:8000` | Only nginx `:80` |
| Frontend | Usually `npm run dev` on host | Container + Nginx |

## Troubleshooting

| Symptom | Checks |
|---------|--------|
| SSH timeout / refused | Security group `admin_cidr` still your current IP? Right key? User `ubuntu`? |
| `deploy.sh` fails on `sslmode` | `DATABASE_URL` must contain `sslmode=require` |
| Health check never passes | `docker compose -f docker-compose.aws.yml ps` / `logs api` / `logs nginx` |
| Login cookie missing | Leave `AUTH_COOKIE_SECURE` unset on HTTP; confirm `frontend/.env` has AUTH_* |
| Frontend calls wrong API host | Rebuild with correct `NEXT_PUBLIC_API_URL` |
| RDS connection errors | From EC2 only; SG chain EC2→RDS; password URL-encoded; SSL mode |
| OOM during frontend build | Prefer `t3.small`; swap is enabled by user_data |

## Out of scope (v1)

Everything in [`aws-ec2-hardening-followup.md`](aws-ec2-hardening-followup.md).
