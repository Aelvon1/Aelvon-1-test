# ARICI – pub Instagram Reels de l'application

Vidéo 1080×1920, 30 i/s, 18 s, H.264 + AAC, son à −14 LUFS.
Livrable : `out/ARICI_Application_Reels.mp4` (+ `out/ARICI_Application_Reels_apercu.jpg`).

## Fabrication (moteur 2D numpy/Pillow → ffmpeg, aucun Blender)

```
python3 src/voice.py      # voix (ElevenLabs ; repli Piper si la clé est refusée)
python3 src/audio.py      # musique 120 bpm + bruitages + mixage −14 LUFS -> build/mix.wav
python3 src/render.py     # rendu image (≈ 3 min sur 4 cœurs) -> build/video_noaudio.mp4
python3 src/mux.py        # assemblage -> out/ARICI_Application_Reels.mp4
python3 src/verify.py     # contrôles -> out/verification/
```

- `src/timeline.py` : toutes les durées (scènes, roue, compteur, voix), partagées par l'image et le son.
- `src/ui.py` : écrans de l'app redessinés (Accueil identique au flyer, Produits, Mon QR, roue, carte points).
- `src/scenes.py` : les 6 scènes, flou de mouvement par sous-échantillonnage, secousses, zooms.
- `src/deco.py` : décors des coins repris du PDF du flyer (mêmes calques, mêmes placements).
- `ref/` : flyer (PDF/PNG), QR officiel (SVG), calques extraits du PDF.

## Remplacer la voix par ElevenLabs (sur le serveur, où l'IP est autorisée)

```
cd ~/arici-app-pub
export $(grep ELEVENLABS_API_KEY ~/stratiaa-pub-livre/.env | xargs)
python3 src/voice.py && python3 src/audio.py && python3 src/render.py && python3 src/mux.py && python3 src/verify.py
```
(`render.py` n'est nécessaire que si la durée totale change ; la voix choisie est notée dans `build/voice/meta.json`.)
