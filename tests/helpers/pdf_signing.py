"""Signed PDF files for the PDF viewer tests (pyHanko with a self-signed RSA or EC certificate)."""
import datetime
import io
from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa, ec
from cryptography.x509.oid import NameOID
from pypdf import PdfWriter
from pyhanko.sign import signers
from pyhanko.pdf_utils.incremental_writer import IncrementalPdfFileWriter
from pyhanko_certvalidator.registry import SimpleCertificateStore
from asn1crypto import x509 as ax509, keys as akeys

def cert(kind="rsa"):
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048) if kind == "rsa" else ec.generate_private_key(ec.SECP256R1())
    name = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, "Anna Test"), x509.NameAttribute(NameOID.ORGANIZATION_NAME, "Test GmbH")])
    now = datetime.datetime.now(datetime.timezone.utc)
    c = x509.CertificateBuilder().subject_name(name).issuer_name(name).public_key(key.public_key()).serial_number(1234).not_valid_before(now - datetime.timedelta(days=1)).not_valid_after(now + datetime.timedelta(days=365)).sign(key, hashes.SHA256())
    return key, c

def pdf():
    w = PdfWriter(); w.add_blank_page(200, 200); b = io.BytesIO(); w.write(b); return b.getvalue()

def _sign(data, kind):
    key, c = cert(kind)
    signer = signers.SimpleSigner(signing_cert=ax509.Certificate.load(c.public_bytes(serialization.Encoding.DER)),
        signing_key=akeys.PrivateKeyInfo.load(key.private_bytes(serialization.Encoding.DER, serialization.PrivateFormat.PKCS8, serialization.NoEncryption())),
        cert_registry=SimpleCertificateStore())
    out = signers.sign_pdf(IncrementalPdfFileWriter(io.BytesIO(data)), signers.PdfSignatureMetadata(field_name="Sig1", reason="Freigabe", location="Graz"), signer=signer)
    return out.getvalue()



def sign(data, kind="rsa"):
    """A signed copy of the PDF. pyHanko runs asyncio.run(), which cannot run inside Playwright's event loop: use a thread."""
    from concurrent.futures import ThreadPoolExecutor
    with ThreadPoolExecutor(1) as pool:
        return pool.submit(_sign, data, kind).result()
