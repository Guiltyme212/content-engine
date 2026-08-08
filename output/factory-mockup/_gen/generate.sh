#!/usr/bin/env bash
# Generate Kokoro carousel slide-1 covers with gpt-image-2 (medium quality = draft tier).
# Reads OPENAI_API_KEY from repo .env. Outputs 1024x1536 PNGs -> ../assets/
set -euo pipefail
cd "$(dirname "$0")"
set -a; source ../../../.env; set +a

OUT="../assets"
mkdir -p "$OUT"

# Shared style recipe — Japanese minimalism, dusk, warm rooms, thin serif type INSIDE the image.
STYLE="Vertical 2:3 social carousel cover. Japanese minimalist aesthetic: soft dusk light, warm muted tones, gentle film grain, calm and intimate mood. Elegant thin serif typography rendered directly in the image, lowercase, warm cream-white text, generous letter spacing, centered. No watermarks, no logos, no UI, no borders. The text must be spelled EXACTLY as given, nothing else added."

# hook | scene | filename
gen () {
  local hook="$1" scene="$2" file="$3"
  echo "→ generating $file …"
  local prompt="$STYLE Scene: $scene. The ONLY text in the image, spelled exactly: \"$hook\""
  curl -s https://api.openai.com/v1/images/generations \
    -H "Authorization: Bearer $OPENAI_API_KEY" \
    -H "Content-Type: application/json" \
    -d "$(jq -n --arg m gpt-image-2 --arg p "$prompt" \
          '{model:$m, prompt:$p, size:"1024x1536", quality:"medium", n:1}')" \
    | jq -r '.data[0].b64_json // (.error.message|tostring)' > "$OUT/$file.b64"
  if head -c 20 "$OUT/$file.b64" | grep -qi "error\|invalid\|must\|not"; then
    echo "   ✗ $(cat "$OUT/$file.b64")"; return 1
  fi
  base64 -d "$OUT/$file.b64" > "$OUT/$file.png" && rm "$OUT/$file.b64"
  echo "   ✓ $OUT/$file.png ($(du -h "$OUT/$file.png" | cut -f1))"
}

gen "for everyone who held it together all day" \
    "a woman sitting alone by a rain-streaked window at dusk, warm lamplight, soft shadows, seen from behind, quiet" \
    "cover-held-it-together"

gen "signs you're the strong one (not okay)" \
    "an empty warm-lit room at evening, a single paper lantern glowing, a cup of tea gone cold on a low table" \
    "cover-strong-one"

gen "you don't need advice. you need to be heard." \
    "close soft focus of hands wrapped around a warm mug, blurred window with soft rain behind, muted dusk palette" \
    "cover-be-heard"

gen "the magic number for a quieter mind is one" \
    "a single sakura branch against a plain warm cream wall, minimal, soft morning light, lots of negative space" \
    "cover-magic-number"

gen "your brain wasn't built for 9 hours of screens" \
    "a quiet forest path in soft green light, mist between trees, calm and grounding, early morning" \
    "cover-nature-brain"

gen "things nobody tells you about being tired" \
    "a softly lit bedroom at dusk, unmade warm bedding, a small lantern, gentle shadows, peaceful and honest" \
    "cover-being-tired"

echo ""
echo "Done. Generated covers in $OUT"
ls -la "$OUT"/*.png 2>/dev/null || echo "(no PNGs — check errors above)"
