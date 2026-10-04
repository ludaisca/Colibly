-- OpenRouter was removed as a provider. Keep existing bots on a supported
-- multimodal model where their previous model was Gemini, and move old GPT
-- bots to the OpenCode vision model. Scorers are text-only.
UPDATE "wa_bots"
SET "provider" = CASE
      WHEN "model" LIKE 'google/gemini-%' THEN 'google'
      ELSE 'opencode'
    END,
    "model" = CASE
      WHEN "model" = 'google/gemini-2.5-flash-lite' THEN 'gemini-2.5-flash-lite'
      WHEN "model" LIKE 'google/gemini-%' THEN 'gemini-2.5-flash'
      WHEN "model" = 'openai/gpt-4o-mini' THEN 'opencode-go/deepseek-v4-flash-vision-exp'
      ELSE 'opencode-go/deepseek-v4-flash-vision-exp'
    END
WHERE "provider" = 'openrouter';

UPDATE "wa_lead_scorer_bots"
SET "provider" = CASE
      WHEN "model" LIKE 'google/gemini-%' THEN 'google'
      ELSE 'opencode'
    END,
    "model" = CASE
      WHEN "model" = 'google/gemini-2.5-flash-lite' THEN 'gemini-2.5-flash-lite'
      WHEN "model" LIKE 'google/gemini-%' THEN 'gemini-2.5-flash'
      ELSE 'opencode-go/glm-5.3-flash'
    END
WHERE "provider" = 'openrouter';
