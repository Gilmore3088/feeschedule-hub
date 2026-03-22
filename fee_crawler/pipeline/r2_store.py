"""Cloudflare R2 document store.

Content-addressed storage: each document is stored at its SHA-256 hash.
Same document = same key = never re-download from the bank's website.

Allows re-running extraction with a new prompt or model without
hitting external websites.
"""

import hashlib
import os
import logging

import boto3
from botocore.config import Config as BotoConfig

logger = logging.getLogger(__name__)


def _get_client():
    """Create S3-compatible client for Cloudflare R2."""
    return boto3.client(
        "s3",
        endpoint_url=os.environ["R2_ENDPOINT"],
        aws_access_key_id=os.environ["R2_ACCESS_KEY_ID"],
        aws_secret_access_key=os.environ["R2_SECRET_ACCESS_KEY"],
        config=BotoConfig(
            region_name="auto",
            s3={"addressing_style": "path"},
        ),
    )


def content_key(content: bytes) -> str:
    """Generate content-addressed key from document bytes."""
    h = hashlib.sha256(content).hexdigest()
    # Prefix with first 2 chars for directory-style partitioning
    return f"{h[:2]}/{h}"


def upload_document(
    content: bytes,
    content_type: str = "application/octet-stream",
    metadata: dict | None = None,
) -> str:
    """Upload document to R2. Returns the content-addressed key.

    Idempotent: uploading the same content returns the same key
    without re-uploading (checks existence first).
    """
    bucket = os.environ["R2_BUCKET"]
    key = content_key(content)

    client = _get_client()

    # Check if already stored
    try:
        client.head_object(Bucket=bucket, Key=key)
        logger.debug("Document already in R2: %s", key)
        return key
    except client.exceptions.ClientError as e:
        if e.response["Error"]["Code"] != "404":
            raise

    # Upload
    extra = {}
    if metadata:
        extra["Metadata"] = {k: str(v) for k, v in metadata.items()}

    client.put_object(
        Bucket=bucket,
        Key=key,
        Body=content,
        ContentType=content_type,
        **extra,
    )
    logger.info("Uploaded document to R2: %s (%d bytes)", key, len(content))
    return key


def download_document(key: str) -> bytes:
    """Download document from R2 by its content-addressed key."""
    bucket = os.environ["R2_BUCKET"]
    client = _get_client()
    resp = client.get_object(Bucket=bucket, Key=key)
    return resp["Body"].read()


def document_exists(key: str) -> bool:
    """Check if a document exists in R2."""
    bucket = os.environ["R2_BUCKET"]
    client = _get_client()
    try:
        client.head_object(Bucket=bucket, Key=key)
        return True
    except client.exceptions.ClientError:
        return False
