//! System telemetry + process inspection via `sysinfo`.

use serde::Serialize;
use sysinfo::{Disks, Networks, System, Users};

pub struct SysMonitor {
    sys: System,
    disks: Disks,
    networks: Networks,
    users: Users,
}

#[derive(Debug, Clone, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct CpuStat {
    pub usage_percent: f32,
    pub cores: usize,
    pub brand: String,
}

#[derive(Debug, Clone, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct MemStat {
    pub total_bytes: u64,
    pub used_bytes: u64,
    pub available_bytes: u64,
    pub swap_total_bytes: u64,
    pub swap_used_bytes: u64,
}

#[derive(Debug, Clone, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct DiskStat {
    pub name: String,
    pub mount: String,
    pub total_bytes: u64,
    pub available_bytes: u64,
    pub removable: bool,
}

#[derive(Debug, Clone, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct NetStat {
    pub rx_bytes: u64,
    pub tx_bytes: u64,
}

#[derive(Debug, Clone, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct HostStat {
    pub hostname: String,
    pub os_name: String,
    pub os_version: String,
    pub kernel: String,
    pub uptime_secs: u64,
    pub process_count: usize,
}

#[derive(Debug, Clone, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct SystemSnapshot {
    pub cpu: CpuStat,
    pub memory: MemStat,
    pub disks: Vec<DiskStat>,
    pub network: NetStat,
    pub host: HostStat,
    pub sampled_at: String,
}

/// One process row. Kept small — the frontend renders this directly.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProcessRow {
    pub pid: u32,
    pub parent_pid: Option<u32>,
    pub name: String,
    /// Best-effort full command line; falls back to the process name.
    pub cmd: String,
    pub cpu_percent: f32,
    pub memory_bytes: u64,
    pub user: Option<String>,
    /// "run" | "sleep" | "zombie" | "stopped" | "idle"
    pub status: String,
}

fn status_str(s: sysinfo::ProcessStatus) -> String {
    match s {
        sysinfo::ProcessStatus::Run => "run",
        sysinfo::ProcessStatus::Sleep => "sleep",
        sysinfo::ProcessStatus::Zombie => "zombie",
        sysinfo::ProcessStatus::Stop => "stopped",
        sysinfo::ProcessStatus::Idle => "idle",
        _ => "other",
    }
    .to_string()
}

impl SysMonitor {
    pub fn new() -> Self {
        let mut sys = System::new_all();
        sys.refresh_all();
        Self {
            sys,
            disks: Disks::new_with_refreshed_list(),
            networks: Networks::new_with_refreshed_list(),
            users: Users::new_with_refreshed_list(),
        }
    }

    pub fn snapshot(&mut self) -> SystemSnapshot {
        self.sys.refresh_cpu_usage();
        self.sys.refresh_memory();
        self.sys.refresh_processes(sysinfo::ProcessesToUpdate::All, true);
        self.disks.refresh();
        self.networks.refresh();

        let cpu = CpuStat {
            usage_percent: self.sys.global_cpu_usage(),
            cores: self.sys.cpus().len(),
            brand: self
                .sys
                .cpus()
                .first()
                .map(|c| c.brand().trim().to_string())
                .unwrap_or_default(),
        };

        let memory = MemStat {
            total_bytes: self.sys.total_memory(),
            used_bytes: self.sys.used_memory(),
            available_bytes: self.sys.available_memory(),
            swap_total_bytes: self.sys.total_swap(),
            swap_used_bytes: self.sys.used_swap(),
        };

        let disks = self
            .disks
            .iter()
            .map(|d| DiskStat {
                name: d.name().to_string_lossy().to_string(),
                mount: d.mount_point().to_string_lossy().to_string(),
                total_bytes: d.total_space(),
                available_bytes: d.available_space(),
                removable: d.is_removable(),
            })
            .collect();

        let mut rx = 0u64;
        let mut tx = 0u64;
        for (_, net) in self.networks.iter() {
            rx += net.received();
            tx += net.transmitted();
        }

        let host = HostStat {
            hostname: System::host_name().unwrap_or_else(|| "unknown".into()),
            os_name: System::name().unwrap_or_else(|| "unknown".into()),
            os_version: System::os_version().unwrap_or_else(|| "unknown".into()),
            kernel: System::kernel_version().unwrap_or_else(|| "unknown".into()),
            uptime_secs: System::uptime(),
            process_count: self.sys.processes().len(),
        };

        SystemSnapshot {
            cpu,
            memory,
            disks,
            network: NetStat { rx_bytes: rx, tx_bytes: tx },
            host,
            sampled_at: chrono::Utc::now().to_rfc3339(),
        }
    }

    /// Top N processes by CPU. Kept for the Monitoring dashboard's card.
    pub fn top_processes(&mut self, limit: usize) -> Vec<ProcessRow> {
        let mut rows = self.collect_processes(None);
        rows.sort_by(|a, b| {
            b.cpu_percent
                .partial_cmp(&a.cpu_percent)
                .unwrap_or(std::cmp::Ordering::Equal)
        });
        rows.truncate(limit);
        rows
    }

    /// Full process list, filtered and sorted. Used by the Processes view.
    pub fn list_processes(
        &mut self,
        filter: Option<String>,
        sort: Option<String>,
        limit: Option<usize>,
    ) -> Vec<ProcessRow> {
        self.sys.refresh_processes(sysinfo::ProcessesToUpdate::All, true);
        let mut rows = self.collect_processes(filter.as_deref());

        match sort.as_deref().unwrap_or("cpu") {
            "memory" | "mem" => rows.sort_by(|a, b| b.memory_bytes.cmp(&a.memory_bytes)),
            "pid" => rows.sort_by_key(|r| r.pid),
            "name" => rows.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase())),
            _ => rows.sort_by(|a, b| {
                b.cpu_percent
                    .partial_cmp(&a.cpu_percent)
                    .unwrap_or(std::cmp::Ordering::Equal)
            }),
        }

        rows.truncate(limit.unwrap_or(500).clamp(1, 5000));
        rows
    }

    fn collect_processes(&mut self, filter: Option<&str>) -> Vec<ProcessRow> {
        let needle = filter
            .map(|s| s.trim().to_lowercase())
            .filter(|s| !s.is_empty());

        self.sys
            .processes()
            .iter()
            .filter_map(|(pid, p)| {
                let name = p.name().to_string_lossy().to_string();

                // Build a best-effort command line from the argv list.
                let cmd = {
                    let parts: Vec<String> = p
                        .cmd()
                        .iter()
                        .map(|s| s.to_string_lossy().to_string())
                        .collect();
                    if parts.is_empty() { name.clone() } else { parts.join(" ") }
                };

                if let Some(n) = &needle {
                    if !name.to_lowercase().contains(n) && !cmd.to_lowercase().contains(n) {
                        return None;
                    }
                }

                let user = p
                    .user_id()
                    .and_then(|uid| self.users.get_user_by_id(uid))
                    .map(|u| u.name().to_string());

                Some(ProcessRow {
                    pid: pid.as_u32(),
                    parent_pid: p.parent().map(|pp| pp.as_u32()),
                    name,
                    cmd,
                    cpu_percent: p.cpu_usage(),
                    memory_bytes: p.memory(),
                    user,
                    status: status_str(p.status()),
                })
            })
            .collect()
    }
}
