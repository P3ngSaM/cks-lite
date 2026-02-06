from anthropic import Anthropic
import os
from dotenv import load_dotenv

load_dotenv(override=True)

api_key = os.getenv('ANTHROPIC_API_KEY')
client = Anthropic(
    api_key=api_key,
    base_url=os.getenv('ANTHROPIC_BASE_URL')
)

# 打印 Authorization 头的值
auth_header = client.auth_headers.get('Authorization')
expected = f'Bearer {api_key}'

print(f'Authorization header: {auth_header}')
print(f'Expected:            {expected}')
print(f'Match: {auth_header == expected}')
