"""
The main part of the code which runs the AI
"""

# IMPORTS
import logging

from google import genai
from google.genai import types

from utils.PROMPTS.user_prompt import USER_PROMPT
from utils.PROMPTS.ai_prompt import PROMPT
from utils.env_loader import GEMINI_API_KEY

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s"
)

client = genai.Client(api_key=GEMINI_API_KEY)

logging.info("Gemini AI client initialized with API key.")
def generate_response():
    logging.info("Generating response using Gemini AI...")
    try:
        response = client.models.generate_content(
            model="gemini-2.5-flash",
            config=types.GenerateContentConfig(
                system_instruction=PROMPT,
            ),
            contents=USER_PROMPT
        )
        logging.info("Response generated successfully.")
        r = response.text
        
        logging.info("Response content: " + r)
        return r
    except Exception as e:
        print("An error occurred while generating the content: " + str(e))
        logging.exception("An error occured while generating the content: " + str(e))
