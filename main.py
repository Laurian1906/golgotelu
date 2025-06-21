"""
The main part of the code which runs the AI
"""
import logging

# IMPORTS
from google import genai
from google.genai import types

from utils.PROMPTS.user_prompt import USER_PROMPT
from utils.PROMPTS.ai_prompt import PROMPT
from utils.env_loader import GEMINI_API_KEY

client = genai.Client(api_key=GEMINI_API_KEY)

try:
    response = client.models.generate_content(
        model="gemini-2.0-flash",
        config=types.GenerateContentConfig(
            system_instruction=PROMPT),
        contents=USER_PROMPT
    )
    print(response.text)
except Exception as e:
    logging.error("An error occured while generating the content: " + str(e))

