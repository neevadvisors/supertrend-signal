resource "aws_db_subnet_group" "app" {
  name       = "${var.project_name}-db"
  subnet_ids = data.aws_subnets.default.ids

  tags = {
    Name = "${var.project_name}-db"
  }
}

resource "aws_db_instance" "app" {
  identifier     = "${var.project_name}-pg"
  engine         = "postgres"
  engine_version = "16"

  instance_class        = var.db_instance_class
  allocated_storage     = var.db_allocated_storage
  max_allocated_storage = 100
  storage_type          = "gp3"
  storage_encrypted     = true

  db_name  = var.db_name
  username = var.db_username
  password = var.db_password

  db_subnet_group_name   = aws_db_subnet_group.app.name
  vpc_security_group_ids = [aws_security_group.rds.id]
  publicly_accessible    = false
  multi_az               = false

  # v1 learning stack: easy destroy. Production retention/deletion protection is follow-up hardening.
  skip_final_snapshot        = true
  deletion_protection        = false
  backup_retention_period    = 0
  delete_automated_backups   = true
  copy_tags_to_snapshot      = false
  auto_minor_version_upgrade = true

  tags = {
    Name = "${var.project_name}-pg"
  }
}
