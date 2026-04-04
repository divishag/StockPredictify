# File Storage Refactoring Documentation

## Overview
The backend file storage logic has been refactored to use a configurable base path instead of hardcoded absolute paths. This makes the database portable across machines and deployment environments.

## Key Changes

### 1. Environment Configuration (`.env`)
Added new environment variable:
```env
STOCK_DATA_BASE_PATH=
```

**How it works:**
- If `STOCK_DATA_BASE_PATH` is set, it will be used as the base directory for all stock data files
- If empty or not set, defaults to `<project_root>/data`
- Path supports `~` expansion for home directory (e.g., `~/stock_data`)
- Directory is created automatically if it doesn't exist

### 2. Helper Functions (`app/services/dataset.py`)

#### `_get_stock_data_dir() -> Path`
- Retrieves the configured stock data directory
- Checks `STOCK_DATA_BASE_PATH` environment variable first
- Falls back to `<project_root>/data` if not set
- Ensures directory exists and is writable
- Called at module load time for backward compatibility

#### `_get_full_data_path(filename: str) -> Path`
- Constructs full file path from base directory + filename
- **Security check**: Validates that filename doesn't contain path separators or start with `.`
- Used whenever we need to access files on disk
- Raises `ValueError` for invalid filenames

### 3. Database Changes

#### What Changed
- **Before**: `file_path` column stored absolute machine-specific paths
  - Example: `/Users/divishagupta/Library/.../StockPredictify/data/AAPL_2024-01-01.csv`
- **After**: `file_path` column stores only the filename
  - Example: `AAPL_2024-01-01.csv`

#### Why
- **Portability**: Database can be backed up and restored on any machine
- **Deployment**: Works across development, staging, and production environments
- **API**: Consumers still get the stored filename (no breaking changes to API)

### 4. Updated Functions

#### `_upsert_download_record()`
- Now stores `file_path = output_path.name` (filename only)
- Previously stored `file_path = str(output_path.resolve())` (absolute path)

#### `get_symbol_preview()`
- Retrieves filename from database
- Calls `_get_full_data_path()` to construct full path
- Includes error handling if path is invalid
- Reads CSV from reconstructed path

#### `delete_symbol_data()`
- Retrieves filename from database
- Calls `_get_full_data_path()` to construct full path
- Handles `ValueError` gracefully if path is invalid
- Deletes files from reconstructed path

#### `download_dataset_data()`
- Creates output files in `_get_stock_data_dir()`
- Stores only filename in database via `_upsert_download_record()`
- Response includes reconstructed directory path via `str(_get_stock_data_dir())`

### 5. Migration Logic

#### `_migrate_file_paths_to_relative()`
- Runs automatically on backend startup
- Finds all existing rows with absolute paths (detected by `/`, `\`, or `:` patterns)
- Extracts filename from each absolute path
- Updates database to store filename only
- Silently skips any rows that fail migration
- Prints summary: `"Migrated N file paths from absolute to relative format"`

#### When It Runs
- Called in `app/main.py` during `@app.on_event("startup")`
- Runs after `init_dataset_table()` and table is created
- Only processes rows that contain absolute paths

### 6. Backward Compatibility
- Module-level `DATA_DIR` variable is preserved (set to `_get_stock_data_dir()`)
- Database schema is unchanged (same columns)
- API responses unchanged (still include `filePath` field with filename)
- Migration runs automatically on first startup after upgrade

## Deployment Instructions

### 1. Local Development
No additional setup needed. Default behavior:
- Uses `<project_root>/data` for CSV storage
- Automatically migrates any existing absolute paths when backend starts

### 2. Custom Path
To use a custom directory for stock data:
```bash
# In backend/.env
STOCK_DATA_BASE_PATH=/var/lib/stockpredictify/data
```

Or with environment variable:
```bash
export STOCK_DATA_BASE_PATH="/path/to/data"
./backend/.venv/bin/python -m uvicorn app.main:app
```

## Testing the Refactoring

### Verify Setup
```bash
# Check .env includes the new variable
cat backend/.env | grep STOCK_DATA_BASE_PATH

# Start backend server (migration runs on startup)
cd backend && python -m uvicorn app.main:app --reload
# Should see: "Migrated X file paths from absolute to relative format"
```

### Test File Operations
1. Download dataset from frontend (creates CSV)
2. View preview chart (reads from reconstructed path)
3. Delete dataset (deletes using reconstructed path)
4. Check database to confirm filename is stored:
   ```sql
   SELECT symbol, file_path FROM stock_dataset_downloads LIMIT 1;
   -- Should show only filename, e.g., "AAPL_2024-01-01.csv"
   ```

## Error Handling

### Missing Base Path
- **Before**: Would create `<project_root>/data` automatically
- **After**: Creates configured path automatically, or falls back to default

### Invalid Filenames
- Functions validate filenames to prevent path traversal
- Example: `../../../etc/passwd` will be rejected
- Raises `ValueError` with clear message

### Missing Files
- During migration: Silently skips rows with invalid paths
- During operations: Raises `RuntimeError` with details about missing file

## Security Considerations

### Path Traversal Prevention
- Filenames are validated to reject `/`, `\`, and `.` prefixes
- Only filenames are stored in database, never full paths
- `_get_full_data_path()` prevents accessing files outside data directory

### File Permissions
- Ensure `STOCK_DATA_BASE_PATH` directory is readable/writable by backend user
- Lock down permissions on production systems: `chmod 700 /var/lib/stockpredictify/data`

## Troubleshooting

### Migration Didn't Run
- Check backend startup logs for errors
- Verify database is accessible
- Migration is silent if no absolute paths exist

### Files Not Found
- Verify `STOCK_DATA_BASE_PATH` is set correctly
- Or ensure `<project_root>/data` directory exists and is writable
- Check file ownership and permissions

### Wrong Data Directory
```bash
# Override in .env
STOCK_DATA_BASE_PATH=/correct/path

# Then restart backend
```

## Database Query Examples

### View All Stored Paths
```sql
SELECT symbol, start_date, file_path FROM stock_dataset_downloads;
-- All file_path values should be just filenames now
```

### Find Any Remaining Absolute Paths (before migration)
```sql
SELECT id, file_path 
FROM stock_dataset_downloads 
WHERE file_path LIKE '/%' OR file_path LIKE '%:\\%' OR file_path LIKE '%\\%';
-- Should return empty after migration
```

## Summary of Benefits

| Aspect | Before | After |
|--------|--------|-------|
| **Portability** | Machine-specific paths | Machine-agnostic filenames |
| **Database Transfer** | Requires path updates | Works as-is |
| **Deployment** | Path hardcoding needed | Configurable via .env |
| **Security** | Full paths exposed | Only filenames in DB |
| **Maintenance** | Manual path fixes | Automatic migration |
