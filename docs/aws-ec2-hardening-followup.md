# AWS EC2 hardening follow-up (out of scope for v1)

v1 ships plain HTTP on the Elastic IP, local Terraform state, and a learning-friendly RDS destroy path. Track production hardening here — do not expand these into the first apply.

## Planned follow-ups

- Public HTTPS (domain + Certbot / ACM)
- SSM Session Manager (reduce reliance on SSH :22)
- AWS Budgets / cost alerts
- RDS backup retention, deletion protection, final snapshot on destroy
- Secrets in SSM Parameter Store / Secrets Manager (not only on-disk `.env` + tfstate)
- Off-box image builds (ECR) instead of `docker compose build` on the instance
- Log rotation and basic recover/alarming
- Remote Terraform state (S3 + DynamoDB lock)
- Custom VPC with private subnets (no default-VPC shortcut)
- ECS/Fargate (if/when leaving the single-EC2 Compose model)
- Decommission any leftover Render dashboard services (config already removed from this repo)
- **Dev toolchain: align local Node/npm with the frontend Docker image (Node 20)** so `package-lock.json` updates match `npm ci` in builds (nvm/fnm + `engines` in `frontend/package.json`; keep committing the lockfile)

When you pick one of these up, add a short design note and checklist under this file or a linked doc before changing Terraform.
