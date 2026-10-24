resource "ec_deployment" "my_deployment" {
  name                   = "my-elasticsearch-cluster"
  region                 = "us-east-1"
  version                = "8.15.0"
  deployment_template_id = "aws-io-optimized-v5"
}
