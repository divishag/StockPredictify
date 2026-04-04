from app.config import load_env_file
from app.services import init_dataset_table, init_trained_models_table


def main() -> None:
    load_env_file()
    init_dataset_table()
    init_trained_models_table()
    print("Database tables are ready: stock_dataset_downloads, trained_models")


if __name__ == "__main__":
    main()