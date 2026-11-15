mod db;

use db::{Db, Statement};
use serde_json::{Map, Value};
use tauri::{Manager, State};

#[tauri::command]
fn db_select(db: State<Db>, sql: String, params: Vec<Value>) -> Result<Vec<Map<String, Value>>, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    db::select(&conn, &sql, &params)
}

#[tauri::command]
fn db_commit(db: State<Db>, statements: Vec<Statement>) -> Result<(), String> {
    let mut conn = db.0.lock().map_err(|e| e.to_string())?;
    db::commit(&mut conn, &statements)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&dir)?;
            app.manage(db::open(&dir.join("taskflow.db"))?);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![db_select, db_commit])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
