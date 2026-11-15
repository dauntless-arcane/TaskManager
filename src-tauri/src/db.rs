//! Minimal SQLite access layer. SQL text lives in the TypeScript repository so both
//! platforms share one logical schema; this module only guarantees real transactions.
use rusqlite::{params_from_iter, types::Value as Sql, types::ValueRef, Connection};
use serde::Deserialize;
use serde_json::{Map, Value};
use std::sync::Mutex;

const MIGRATIONS: &[&str] = &[include_str!("../migrations/001_init.sql")];

pub struct Db(pub Mutex<Connection>);

#[derive(Deserialize)]
pub struct Statement {
    pub sql: String,
    #[serde(default)]
    pub params: Vec<Value>,
}

pub fn open(path: &std::path::Path) -> Result<Db, String> {
    let mut conn = Connection::open(path).map_err(|e| e.to_string())?;
    conn.execute_batch("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;")
        .map_err(|e| e.to_string())?;
    migrate(&mut conn)?;
    Ok(Db(Mutex::new(conn)))
}

/// Applies pending migrations, each atomically, tracked by PRAGMA user_version.
pub fn migrate(conn: &mut Connection) -> Result<(), String> {
    let current = conn
        .query_row("PRAGMA user_version", [], |r| r.get::<_, i64>(0))
        .map_err(|e| e.to_string())? as usize;
    for (i, sql) in MIGRATIONS.iter().enumerate().skip(current) {
        let tx = conn.transaction().map_err(|e| e.to_string())?;
        tx.execute_batch(sql).map_err(|e| format!("migration {} failed: {e}", i + 1))?;
        tx.execute_batch(&format!("PRAGMA user_version = {}", i + 1))
            .map_err(|e| e.to_string())?;
        tx.commit().map_err(|e| e.to_string())?;
    }
    Ok(())
}

fn to_sql(v: &Value) -> Result<Sql, String> {
    Ok(match v {
        Value::Null => Sql::Null,
        Value::Bool(b) => Sql::Integer(*b as i64),
        Value::Number(n) => match n.as_i64() {
            Some(i) => Sql::Integer(i),
            None => Sql::Real(n.as_f64().ok_or("invalid number")?),
        },
        Value::String(s) => Sql::Text(s.clone()),
        _ => return Err("unsupported parameter type".into()),
    })
}

fn bind(params: &[Value]) -> Result<Vec<Sql>, String> {
    params.iter().map(to_sql).collect()
}

pub fn select(conn: &Connection, sql: &str, params: &[Value]) -> Result<Vec<Map<String, Value>>, String> {
    let mut stmt = conn.prepare(sql).map_err(|e| e.to_string())?;
    let names: Vec<String> = stmt.column_names().map(|s| s.to_string()).collect();
    let rows = stmt
        .query_map(params_from_iter(bind(params)?), |row| {
            let mut m = Map::new();
            for (i, name) in names.iter().enumerate() {
                let v = match row.get_ref(i)? {
                    ValueRef::Null | ValueRef::Blob(_) => Value::Null,
                    ValueRef::Integer(n) => Value::from(n),
                    ValueRef::Real(f) => Value::from(f),
                    ValueRef::Text(t) => Value::from(String::from_utf8_lossy(t).into_owned()),
                };
                m.insert(name.clone(), v);
            }
            Ok(m)
        })
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<_, _>>().map_err(|e| e.to_string())
}

/// Runs every statement in one transaction; any failure rolls back all of them.
pub fn commit(conn: &mut Connection, statements: &[Statement]) -> Result<(), String> {
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    for s in statements {
        tx.execute(&s.sql, params_from_iter(bind(&s.params)?))
            .map_err(|e| e.to_string())?;
    }
    tx.commit().map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn mem() -> Connection {
        let mut c = Connection::open_in_memory().unwrap();
        c.execute_batch("PRAGMA foreign_keys = ON;").unwrap();
        migrate(&mut c).unwrap();
        c
    }

    fn insert(id: &str, parent: Option<&str>) -> Statement {
        Statement {
            sql: "INSERT INTO tasks (id,parent_id,task_type,title,status,priority,progress_percent,weight,position,progress_method,created_at,updated_at) VALUES (?,?,'task','t','todo','medium',0,1,0,'equal','x','x')".into(),
            params: vec![Value::from(id), parent.map(Value::from).unwrap_or(Value::Null)],
        }
    }

    #[test]
    fn migration_is_idempotent() {
        let mut c = mem();
        migrate(&mut c).unwrap();
        let v: i64 = c.query_row("PRAGMA user_version", [], |r| r.get(0)).unwrap();
        assert_eq!(v, 1);
    }

    #[test]
    fn commit_rolls_back_on_failure() {
        let mut c = mem();
        let bad = Statement { sql: "INSERT INTO nope VALUES (1)".into(), params: vec![] };
        assert!(commit(&mut c, &[insert("a", None), bad]).is_err());
        assert!(select(&c, "SELECT id FROM tasks", &[]).unwrap().is_empty());
    }

    #[test]
    fn foreign_keys_enforced_and_delete_cascades() {
        let mut c = mem();
        commit(&mut c, &[insert("a", None), insert("b", Some("a"))]).unwrap();
        assert!(commit(&mut c, &[insert("c", Some("missing"))]).is_err());
        let del = Statement { sql: "DELETE FROM tasks WHERE id = ?".into(), params: vec![Value::from("a")] };
        commit(&mut c, &[del]).unwrap();
        assert!(select(&c, "SELECT id FROM tasks", &[]).unwrap().is_empty());
    }
}
