# Follow-up: AWS EC2 / RDS hardening (after v1)

> Project-local copy so you can open this in a future session. Mirror of the Cursor plan `AWS EC2 Hardening Followup`.
>
> Do **not** start until v1 is live: EC2 + RDS + Nginx **HTTP** + Docker Compose (`api` / `worker` / frontend) reachable via Elastic IP.

## Why this is separate

v1 is a learnable same-origin **HTTP** stack on one EC2 (frontend + API on AWS, not Vercel). This follow-up adds public HTTPS and production hardening.

## HTTPS (deferred from v1)

Because the frontend is on AWS too, mixed content is not a v1 blocker. Add TLS when you want a real public URL:

- Use a **domain** (or subdomain); DNS **A record → Elastic IP**
- Free cert via **Let’s Encrypt + Certbot** with **Nginx** (no paid certificate product)
- Open security group **443**; redirect HTTP → HTTPS
- Point app URLs / cookies / CORS at `https://...`

## Strong adds

### Access
- IAM instance profile with `AmazonSSMManagedInstanceCore`
- Prefer **SSM Session Manager** for shell/deploy; close SSH 22 if unused
- Require **IMDSv2** on the instance

### Cost
- `aws_budgets_budget` (+ SNS email) in Terraform
- Avoid NAT gateway, Multi-AZ, Performance Insights, Enhanced Monitoring unless needed

### RDS
- `backup_retention_period` ≥ 1 (prefer 7)
- `deletion_protection = true`
- `skip_final_snapshot = false`
- `storage_type = gp3` (~20GB) + `max_allocated_storage` cap

### Secrets
- `random_password` for DB master password
- Store app secrets in **SSM Parameter Store SecureString**
- On-box `.env` permissions `600`

### Builds / images (optional)
- Build on laptop/CI → push **ECR** → EC2 pulls by tag (avoids OOM on micro; easier rollback)

### Dev toolchain (Node / lockfile)
- Standardize **local frontend Node on 20.x** (nvm/fnm), matching `frontend/Dockerfile` (`node:20-…`)
- Add `engines` to `frontend/package.json` (e.g. `"node": ">=20 <21"`) and document in README
- Keep committing `frontend/package-lock.json`; refresh it with Node 20 when adding deps so Docker `npm ci` stays green
- Optional: CI check that `npm ci` passes under Node 20 before merge

### Ops hygiene
- Root volume gp3 20–30GB
- Docker log rotation + periodic `docker image prune`
- CloudWatch status-check alarm with EC2 recover action
- Compose `restart: unless-stopped`, healthchecks, explicit `TZ` for market cron
- If origins ever split again, lock CORS to exact production host(s)

## Checklist

- [ ] Domain + Certbot HTTPS on Nginx
- [ ] SSM instance profile + Session Manager
- [ ] Budget alert
- [ ] RDS backup / deletion protection / gp3
- [ ] Secrets in SSM SecureString
- [ ] Optional ECR image flow
- [ ] Log rotation / prune / recover alarm / TZ / restart policies
- [ ] Local Node 20 + `engines` + lockfile workflow aligned with Docker `npm ci`

## Still later (not this follow-up)

- Custom private-subnet VPC + NAT
- Remote Terraform state (S3 + DynamoDB)
- ECS / Fargate migration
