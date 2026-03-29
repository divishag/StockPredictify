from app.config import load_env_file
from app.services import init_dataset_table


def main() -> None:
    load_env_file()
    init_dataset_table()
    print("Database table is ready: stock_dataset_downloads")


if __name__ == "__main__":
    main()