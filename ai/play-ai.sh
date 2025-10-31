#!/bin/bash
# Convenience script to play AI in a game
# Usage: ./play-ai.sh <gameId> <password> [modelPath] [botName]

if [ "$#" -lt 2 ]; then
    echo "Usage: ./play-ai.sh <gameId> <password> [modelPath] [botName]"
    echo ""
    echo "Examples:"
    echo "  ./play-ai.sh abc123 mypass"
    echo "  ./play-ai.sh abc123 mypass ./checkpoints/model_cycle_100"
    echo "  ./play-ai.sh abc123 mypass ./checkpoints/model_cycle_100 'MasterBot'"
    echo ""
    echo "To find best model: npm run find-best-model"
    exit 1
fi

GAME_ID="$1"
PASSWORD="$2"
MODEL_PATH="${3:-}"
BOT_NAME="${4:-AI_Bot}"

echo "🤖 Starting AI Bot..."
echo "   Game ID: $GAME_ID"
echo "   Bot Name: $BOT_NAME"

if [ -n "$MODEL_PATH" ]; then
    echo "   Model: $MODEL_PATH"
    npm run play "$GAME_ID" "$PASSWORD" "$MODEL_PATH" "$BOT_NAME"
else
    echo "   Model: Untrained (random play)"
    npm run play "$GAME_ID" "$PASSWORD"
fi
