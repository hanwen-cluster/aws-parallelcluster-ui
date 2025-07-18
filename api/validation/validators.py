import json

from marshmallow import validate, ValidationError
import re

from api.logging import VALID_LOG_LEVELS

# PC available regions
PC_REGIONS = [
    'us-east-2','us-east-1','us-west-1','us-west-2',
    'af-south-1','ap-east-1','ap-south-1','ap-northeast-2',
    'ap-southeast-1','ap-southeast-2','ap-northeast-1',
    'ca-central-1','cn-north-1','cn-northwest-1',
    'eu-central-1','eu-west-1','eu-west-2',
    'eu-south-1','eu-west-3','eu-north-1','me-south-1',
    'sa-east-1','us-gov-east-1','us-gov-west-1'
]

def is_alphanumeric_with_hyphen(arg: str):
    pattern = re.compile(r"^[a-zA-Z][a-zA-Z0-9-]+$")
    return bool(re.fullmatch(pattern, arg))


aws_region_validator = validate.OneOf(choices=PC_REGIONS)


def valid_api_log_levels_predicate(loglevel):
    return loglevel.lower() in VALID_LOG_LEVELS

def size_not_exceeding(data, size):
    bytes_ = bytes(json.dumps(data), 'utf-8')
    byte_size = len(bytes_)
    if byte_size > size:
        raise ValidationError(f'Request body exceeded max size of {size} bytes')

def is_safe_path(arg: str):
    """
    Validates if a given path is safe from path traversal attacks.

    This function checks for the presence of directory traversal patterns
    (../ or ..\) in the provided path string. These patterns are commonly
    used in path traversal attacks to access files outside the intended
    directory.

    Args:
    arg (str): The path string to validate.
        Examples:
        - "/v3/clusters" (safe)
        - "v3/clusters" (safe)
         "/v3/../../stage/v3/clusters" (safe)
        - "../stage/v3/clusters" (unsafe)

    Returns:
    bool: True if the path is safe (no traversal patterns)
          False if the path contains traversal patterns
    """
    return not re.search(r'\.\.[\\/]', arg)