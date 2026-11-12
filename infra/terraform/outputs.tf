output "eip_public_ip" {
  description = "Elastic IP attached to the app EC2 instance"
  value       = aws_eip.app.public_ip
}

output "app_url" {
  description = "HTTP URL for the app (Nginx on port 80)"
  value       = "http://${aws_eip.app.public_ip}"
}

output "rds_endpoint" {
  description = "RDS hostname (private; reachable from EC2)"
  value       = aws_db_instance.app.address
}

output "rds_port" {
  description = "RDS port"
  value       = aws_db_instance.app.port
}

output "ssh_command" {
  description = "SSH into the instance using your local private key"
  value       = "ssh -i ${trimsuffix(pathexpand(var.ssh_public_key_path), ".pub")} ubuntu@${aws_eip.app.public_ip}"
}

output "key_pair_name" {
  description = "EC2 key pair name registered from your public key"
  value       = aws_key_pair.app.key_name
}
