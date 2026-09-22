//! IPC command surface. Grouped by domain.

mod api;
mod database;
mod docker;
mod fs;
mod git;
pub mod plugins;
mod system;
mod terminal;
mod workspace;

pub use api::*;
pub use database::*;
pub use docker::*;
pub use fs::*;
pub use git::*;
pub use plugins::*;
pub use system::*;
pub use terminal::*;
pub use workspace::*;
