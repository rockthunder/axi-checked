resource "aws_opensearch_domain" "logs" {
  domain_name    = "logs-cluster"
  engine_version = "OpenSearch_2.11"

  cluster_config {
    instance_type = "r6g.large.search"
  }
}
