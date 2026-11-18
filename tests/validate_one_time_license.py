"""Cross-language check using an actual app checkout and temporary RSA key.
Run: <app-python> tests/validate_one_time_license.py <app-source-directory>
No provider calls or production signing keys.
"""
import json
from pathlib import Path
import subprocess
import sys

app = Path(sys.argv[1]).resolve()
sys.path.insert(0, str(app))
from license import validate_license_key, LicenseInvalidError

script = """
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { oneTimePurchase } from './api/lib/webhook-logic.js';
const keys = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048, privateKeyEncoding: {type:'pkcs8',format:'pem'},
  publicKeyEncoding: {type:'spki',format:'pem'},
});
const purchase = oneTimePurchase({
  id:'cs_cross_language', mode:'payment', payment_status:'paid',
  created:Math.floor(Date.now()/1000)-60,
  customer_details:{email:'buyer@example.com',name:'Test Buyer'},
  metadata:{fulfillment_version:'one_time_v1',tier:'team',seats:'5',
    purchase_price_id:'price_test'},
});
console.log(JSON.stringify({
  token:jwt.sign(purchase.payload,keys.privateKey,{algorithm:'RS256'}),
  publicKey:keys.publicKey, payload:purchase.payload,
}));
"""
result = subprocess.run(
    ["node", "--input-type=module", "-e", script],
    cwd=Path(__file__).resolve().parents[1],
    check=True, capture_output=True, text=True,
)
fixture = json.loads(result.stdout)
info = validate_license_key(fixture["token"], fixture["publicKey"], ["RS256"])
assert info.edition.value == "team"
assert info.seats == 5
assert info.org_name == "Test Buyer"
assert info.key_id == "checkout:cs_cross_language"
assert info.expiry_timestamp == fixture["payload"]["exp"]
assert info.issued_at == fixture["payload"]["iat"]
parts = fixture["token"].split(".")
parts[1] = parts[1][:-1] + ("A" if parts[1][-1] != "A" else "B")
try:
    validate_license_key(".".join(parts), fixture["publicKey"], ["RS256"])
except LicenseInvalidError:
    pass
else:
    raise AssertionError("Tampered token accepted")
print("PASS: website token accepted by app; claims match; tampering rejected")
