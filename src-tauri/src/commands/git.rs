//! Git operations for the Git view.
//!
//! All commands take an absolute repository path (the same string stored on
//! the `projects` table) and shell out to the system `git` binary. Nothing
//! is cached; every call is fresh. This mirrors how `git status` in a real
//! terminal behaves and keeps DevOS honest about what's on disk.

use anyhow::{anyhow, Result};
use serde::Serialize;
use std::process::Command;

type CmdResult<T> = Result<T, String>;

/// Run `git -C <repo> <args…>` and return stdout on success.
fn git(repo: &str, args: &[&str]) -> Result<String> {
    let out = Command::new("git")
        .arg("-C")
        .arg(repo)
        .args(args)
        .output()
        .map_err(|e| anyhow!("failed to spawn git: {e}"))?;

    if !out.status.success() {
        let err = String::from_utf8_lossy(&out.stderr).trim().to_string();
        return Err(anyhow!(if err.is_empty() {
            format!("git {} failed", args.first().copied().unwrap_or(""))
        } else {
            err
        }));
    }
    Ok(String::from_utf8_lossy(&out.stdout).to_string())
}

// ------------------------------------------------------------ status

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitFileStatus {
    /// Repo-relative path.
    pub path: String,
    /// First porcelain column — index (staged) status.
    pub index: String,
    /// Second porcelain column — worktree status.
    pub worktree: String,
    /// True when `index` is not `' '` or `'?'` (i.e. has staged changes).
    pub staged: bool,
    /// True when this is a new untracked file.
    pub untracked: bool,
    /// Original path for renames, if any.
    pub renamed_from: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitRepoStatus {
    pub branch: String,
    pub upstream: Option<String>,
    pub ahead: i32,
    pub behind: i32,
    pub files: Vec<GitFileStatus>,
}

/// Full porcelain=v1 status, one entry per changed file.
#[tauri::command]
pub fn git_status_files(repo: String) -> CmdResult<GitRepoStatus> {
    let raw = git(&repo, &["status", "--porcelain=v1", "-b"]).map_err(|e| e.to_string())?;

    let mut branch = String::new();
    let mut upstream: Option<String> = None;
    let mut ahead = 0i32;
    let mut behind = 0i32;
    let mut files: Vec<GitFileStatus> = Vec::new();

    for line in raw.lines() {
        if let Some(rest) = line.strip_prefix("## ") {
            // "main...origin/main [ahead 2, behind 1]" or "main" or "HEAD (no branch)"
            let (head, tail) = match rest.split_once("...") {
                Some((h, t)) => (h.trim().to_string(), Some(t)),
                None => (rest.trim().to_string(), None),
            };
            branch = head;
            if let Some(t) = tail {
                let (up, stats) = match t.split_once(' ') {
                    Some((u, s)) => (u.trim().to_string(), s),
                    None => (t.trim().to_string(), ""),
                };
                upstream = Some(up);
                for tok in stats.trim_matches(['[', ']']).split(',') {
                    let tok = tok.trim();
                    if let Some(n) = tok.strip_prefix("ahead ") {
                        ahead = n.parse().unwrap_or(0);
                    } else if let Some(n) = tok.strip_prefix("behind ") {
                        behind = n.parse().unwrap_or(0);
                    }
                }
            }
            continue;
        }

        if line.len() < 3 {
            continue;
        }
        let bytes = line.as_bytes();
        let x = bytes[0] as char;
        let y = bytes[1] as char;
        let rest = &line[3..];

        let (path, renamed_from) = if let Some((old, new)) = rest.split_once(" -> ") {
            (new.trim().to_string(), Some(old.trim().to_string()))
        } else {
            (rest.trim().to_string(), None)
        };

        let untracked = x == '?' && y == '?';
        let staged = !untracked && x != ' ';

        files.push(GitFileStatus {
            path,
            index: x.to_string(),
            worktree: y.to_string(),
            staged,
            untracked,
            renamed_from,
        });
    }

    Ok(GitRepoStatus { branch, upstream, ahead, behind, files })
}

// ------------------------------------------------------------ diff

#[tauri::command]
pub fn git_diff(repo: String, file: String, staged: bool) -> CmdResult<String> {
    let args: Vec<&str> = if staged {
        vec!["diff", "--cached", "--no-color", "--", &file]
    } else {
        vec!["diff", "--no-color", "--", &file]
    };
    git(&repo, &args).map_err(|e| e.to_string())
}

// ------------------------------------------------------------ stage / unstage

#[tauri::command]
pub fn git_stage(repo: String, paths: Vec<String>) -> CmdResult<()> {
    if paths.is_empty() {
        return Ok(());
    }
    let mut args: Vec<&str> = vec!["add", "--"];
    for p in &paths {
        args.push(p.as_str());
    }
    git(&repo, &args).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn git_unstage(repo: String, paths: Vec<String>) -> CmdResult<()> {
    if paths.is_empty() {
        return Ok(());
    }
    // `git restore --staged` works on modern git. Falls back to `reset HEAD`.
    let mut args: Vec<&str> = vec!["restore", "--staged", "--"];
    for p in &paths {
        args.push(p.as_str());
    }
    if git(&repo, &args).is_err() {
        let mut fallback: Vec<&str> = vec!["reset", "HEAD", "--"];
        for p in &paths {
            fallback.push(p.as_str());
        }
        git(&repo, &fallback).map_err(|e| e.to_string())?;
    }
    Ok(())
}

// ------------------------------------------------------------ commit

#[tauri::command]
pub fn git_commit(repo: String, message: String) -> CmdResult<String> {
    if message.trim().is_empty() {
        return Err("commit message is empty".into());
    }
    let out = git(&repo, &["commit", "-m", &message]).map_err(|e| e.to_string())?;
    Ok(out.trim().to_string())
}

// ------------------------------------------------------------ log

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitCommit {
    pub hash: String,
    pub short: String,
    pub subject: String,
    pub author: String,
    pub at: String,
}

/// Recent commits on the current branch.
#[tauri::command]
pub fn git_log(repo: String, limit: Option<u32>) -> CmdResult<Vec<GitCommit>> {
    let n = limit.unwrap_or(20).clamp(1, 200).to_string();
    let raw = git(
        &repo,
        &["log", "-n", &n, "--pretty=format:%H%x1f%h%x1f%s%x1f%an%x1f%cI"],
    )
    .map_err(|e| e.to_string())?;

    let mut out = Vec::new();
    for line in raw.lines() {
        let parts: Vec<&str> = line.split('\u{1f}').collect();
        if parts.len() < 5 {
            continue;
        }
        out.push(GitCommit {
            hash: parts[0].into(),
            short: parts[1].into(),
            subject: parts[2].into(),
            author: parts[3].into(),
            at: parts[4].into(),
        });
    }
    Ok(out)
}

// ------------------------------------------------------------ branches

#[tauri::command]
pub fn git_branches(repo: String) -> CmdResult<Vec<String>> {
    let raw = git(&repo, &["branch", "--format=%(refname:short)"]).map_err(|e| e.to_string())?;
    Ok(raw.lines().map(|s| s.trim().to_string()).filter(|s| !s.is_empty()).collect())
}

#[tauri::command]
pub fn git_checkout(repo: String, branch: String) -> CmdResult<()> {
    git(&repo, &["checkout", &branch]).map_err(|e| e.to_string())?;
    Ok(())
}
