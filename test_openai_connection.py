import os

from dotenv import load_dotenv
from openai import OpenAI


def main() -> None:
    load_dotenv()
    api_key = os.getenv("OPENAI_API_KEY")

    if not api_key or api_key == "your_openai_api_key_here":
        print("Please set OPENAI_API_KEY in .env before running this script.")
        return

    try:
        client = OpenAI(api_key=api_key)
        response = client.responses.create(
            model="gpt-4.1-mini",
            input="Reply with exactly: API connection successful.",
        )
        print("OpenAI API response:")
        print(response.output_text)
    except Exception as exc:
        print("OpenAI API connection failed:")
        print(exc)


if __name__ == "__main__":
    main()
