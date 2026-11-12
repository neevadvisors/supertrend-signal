variable "region" {
  description = "AWS region for all resources"
  type        = string
  default     = "ap-south-1"
}

variable "project_name" {
  description = "Short name used in resource Name tags"
  type        = string
  default     = "neev-signals"
}

variable "ssh_public_key_path" {
  description = "Path to an existing SSH public key (registered as aws_key_pair; private key stays on your laptop)"
  type        = string
}

variable "admin_cidr" {
  description = "CIDR allowed to SSH to the EC2 instance (prefer your public IP /32)"
  type        = string

  validation {
    condition     = can(cidrhost(var.admin_cidr, 0))
    error_message = "admin_cidr must be a valid CIDR block (e.g. 1.2.3.4/32)."
  }
}

variable "instance_type" {
  description = "EC2 instance type (t3.small recommended for Next.js builds)"
  type        = string
  default     = "t3.small"
}

variable "root_volume_size_gb" {
  description = "EC2 root volume size in GiB (gp3)"
  type        = number
  default     = 30
}

variable "db_instance_class" {
  description = "RDS instance class"
  type        = string
  default     = "db.t4g.micro"
}

variable "db_allocated_storage" {
  description = "RDS allocated storage in GiB (gp3)"
  type        = number
  default     = 20
}

variable "db_name" {
  description = "Initial Postgres database name"
  type        = string
  default     = "signals"
}

variable "db_username" {
  description = "RDS master username"
  type        = string
  default     = "signals"
}

variable "db_password" {
  description = "RDS master password (stored in local Terraform state — do not commit state)"
  type        = string
  sensitive   = true
}
