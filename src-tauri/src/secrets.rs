//! Local secret vault.
//!
//! Secrets never touch the SQLite file in plaintext. We derive a 32-byte key
//! from a randomly generated key file stored in the app data directory with
//! owner-only permissions (0600 on Unix), then encrypt each secret with
//! XChaCha20-Poly1305 and a fresh 24-byte nonce.

use anyhow::{anyhow, Context, Result};
use base64::{engine::general_purpose::STANDARD as B64, Engine};
use chacha20poly1305::{
    aead::{Aead, KeyInit},
    XChaCha20Poly1305, XNonce,
};
use rand::RngCore;
use std::path::{Path, PathBuf};

pub struct Vault {
    cipher: XChaCha20Poly1305,
    #[allow(dead_code)]
    key_path: PathBuf,
}

impl Vault {
    pub fn load_or_create(key_path: PathBuf) -> Result<Self> {
        let key_bytes = if key_path.exists() {
            let raw = std::fs::read_to_string(&key_path)?;
            B64.decode(raw.trim()).context("vault key is corrupt")?
        } else {
            let mut buf = [0u8; 32];
            rand::thread_rng().fill_bytes(&mut buf);
            std::fs::write(&key_path, B64.encode(buf))?;
            restrict_permissions(&key_path)?;
            buf.to_vec()
        };

        let cipher = XChaCha20Poly1305::new_from_slice(&key_bytes)
            .map_err(|_| anyhow!("invalid vault key length"))?;

        Ok(Vault { cipher, key_path })
    }

    /// Returns base64(nonce || ciphertext).
    pub fn encrypt(&self, plaintext: &str) -> Result<String> {
        let mut nonce_bytes = [0u8; 24];
        rand::thread_rng().fill_bytes(&mut nonce_bytes);
        let nonce = XNonce::from_slice(&nonce_bytes);

        let ciphertext = self
            .cipher
            .encrypt(nonce, plaintext.as_bytes())
            .map_err(|_| anyhow!("encryption failed"))?;

        let mut out = Vec::with_capacity(24 + ciphertext.len());
        out.extend_from_slice(&nonce_bytes);
        out.extend_from_slice(&ciphertext);
        Ok(B64.encode(out))
    }

    pub fn decrypt(&self, blob: &str) -> Result<String> {
        let raw = B64.decode(blob).context("secret blob is not valid base64")?;
        if raw.len() < 25 {
            return Err(anyhow!("secret blob is truncated"));
        }
        let (nonce_bytes, ciphertext) = raw.split_at(24);
        let nonce = XNonce::from_slice(nonce_bytes);

        let plaintext = self
            .cipher
            .decrypt(nonce, ciphertext)
            .map_err(|_| anyhow!("decryption failed (wrong key or tampered data)"))?;

        String::from_utf8(plaintext).context("secret is not valid UTF-8")
    }
}

#[cfg(unix)]
fn restrict_permissions(path: &Path) -> Result<()> {
    use std::os::unix::fs::PermissionsExt;
    let mut perms = std::fs::metadata(path)?.permissions();
    perms.set_mode(0o600);
    std::fs::set_permissions(path, perms)?;
    Ok(())
}

#[cfg(not(unix))]
fn restrict_permissions(_path: &Path) -> Result<()> {
    Ok(())
}
