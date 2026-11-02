
import os
import getpass
import webbrowser

from dotenv import load_dotenv
from fyers_apiv3 import fyersModel

load_dotenv()

APP_ID = os.getenv("FYERS_APP_ID")
SECRET_ID = os.getenv("FYERS_SECRET_ID")
REDIRECT_URI = os.getenv("FYERS_REDIRECT_URI")

if not all([APP_ID, SECRET_ID, REDIRECT_URI]):
    raise ValueError("Missing FYERS credentials in .env")

# Create authentication session
session = fyersModel.SessionModel(
    client_id=APP_ID,
    secret_key=SECRET_ID,
    redirect_uri=REDIRECT_URI,
    response_type="code",
    grant_type="authorization_code"
)

# Generate login URL
login_url = session.generate_authcode()

print("\nOpening FYERS login...")
print("If browser does not open, use this URL:")
print(login_url)

webbrowser.open(login_url)

# Login and authorize your app
auth_code = getpass.getpass(
    "\nPaste the auth_code from the redirected URL: "
).strip()

if not auth_code:
    raise ValueError("Authorization code is required")

# Generate access token
session.set_token(auth_code)
response = session.generate_token()

if response.get("s") != "ok":
    raise RuntimeError(f"Authentication failed: {response}")

access_token = response["access_token"]

# Save token securely
with open("token.txt", "w") as file:
    file.write(access_token)

print("\nSUCCESS! FYERS authentication completed.")
print("Access token saved in token.txt")
