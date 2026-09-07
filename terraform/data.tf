resource "aws_dynamodb_table" "stockroom" {
  name         = "${var.project_name}-table"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "PK"
  range_key    = "SK"

  attribute {
    name = "PK"
    type = "S"
  }

  attribute {
    name = "SK"
    type = "S"
  }

  ttl {
    attribute_name = "ttl"
    enabled        = true
  }

  point_in_time_recovery {
    enabled = true
  }
}

# Both parameters hold key material written OUTSIDE Terraform, and the
# placeholders below are what Terraform writes on any CREATE. `name` is
# ForceNew, so renaming the project — or re-applying against a lost state —
# recreates the resource and overwrites the operator's real RS256 signing key
# with the literal string below. Write-only arguments are never read back, so
# no later plan shows drift: the first symptom is a total auth outage.
# `prevent_destroy` turns that silent overwrite into an explicit plan error.
# Tearing the stack down therefore needs the extra step the README documents.
resource "aws_ssm_parameter" "signing_key" {
  name             = local.signing_key_parameter_name
  type             = "SecureString"
  value_wo         = "replace-with-real-rs256-private-key-outside-terraform"
  value_wo_version = 1

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_ssm_parameter" "verification_keys" {
  name             = local.verification_keys_parameter_name
  type             = "SecureString"
  value_wo         = "[]"
  value_wo_version = 1

  lifecycle {
    prevent_destroy = true
  }
}
