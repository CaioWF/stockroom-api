locals {
  vpc_cidr            = "10.40.0.0/16"
  public_subnet_cidrs = ["10.40.0.0/24", "10.40.1.0/24"]

  # Consumed by data.tf, and reached indirectly by compute.tf through those
  # resources' own attributes. They live here rather than in whichever file
  # happened to declare them first — an SSM parameter name is not networking.
  signing_key_parameter_name       = "/${var.project_name}/jwt/signing-key"
  verification_keys_parameter_name = "/${var.project_name}/jwt/verification-keys"
}
