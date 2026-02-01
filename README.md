# 🏎️ Neon Rush - 3D Car Racing Game

A thrilling 3D browser-based racing game built with Three.js featuring neon aesthetics, realistic physics, and challenging gameplay mechanics.

## 🎮 Features

- **Stunning 3D Graphics**: Built with Three.js for smooth and immersive 3D rendering
- **Dynamic Road System**: 
  - Curved roads with realistic physics
  - Crossroads and junctions with turning mechanics
  - Dual carriageway with oncoming traffic
- **Traffic System**: 
  - Autonomous vehicles to overtake
  - Oncoming traffic for near-miss bonus points
  - Red light system with penalty tracking
- **Pedestrian System**: Avoid pedestrians crossing the road
- **Realistic Speedometer**: Animated SVG speedometer showing speed (0-200 KM/H)
- **Advanced Scoring**:
  - Points for overtaking vehicles
  - Bonus points for near misses with oncoming traffic
  - Penalties for running red lights
  - Points for avoiding pedestrians
- **Audio System**: Dynamic engine sounds that change with speed
- **Neon Visual Style**: Eye-catching cyberpunk-inspired design with glowing effects

## 🚀 How to Run

This game runs directly in your web browser with no build process required!

### Option 1: Local Server
1. Clone the repository:
   ```bash
   git clone https://github.com/zaselalk/3d-car-race-js.git
   cd 3d-car-race-js
   ```

2. Start a local server (choose one method):
   ```bash
   # Python 3
   python -m http.server 8000
   
   # Python 2
   python -m SimpleHTTPServer 8000
   
   # Node.js (if you have http-server installed)
   npx http-server
   ```

3. Open your browser and navigate to:
   ```
   http://localhost:8000
   ```

### Option 2: Direct File Open
Simply open `index.html` in a modern web browser (Chrome, Firefox, or Edge recommended).

## 🎯 Controls

| Key | Action |
|-----|--------|
| `←` / `→` | Steer Left/Right |
| `↑` | Accelerate |
| `↓` | Brake |

### 💡 Gameplay Tips

- ⚠️ **Watch out for pedestrians!** - Avoid hitting them to maintain your score
- 🚦 **Stop at red lights!** - Running red lights will add penalties
- 🚗 **Overtake traffic** - Pass vehicles to earn bonus points
- 💨 **Near miss oncoming traffic** - Get close to oncoming vehicles without crashing for +25 points
- 🔀 **Slow down at junctions** - Reduce speed to turn left or right at intersections

## 🎲 Game Mechanics

### Scoring System
- **Vehicles Overtaken**: Earn points by passing slower traffic
- **Near Misses**: +25 points for close calls with oncoming traffic
- **Pedestrians Avoided**: Keep them safe to maintain your score
- **Distance**: Points accumulated based on distance traveled

### Penalties
- **Red Lights Ran**: Each red light violation is tracked and penalized
- **Pedestrian Collisions**: Hitting pedestrians will negatively impact your score

## 🛠️ Technologies Used

- **Three.js (r128)**: 3D graphics rendering engine
- **Vanilla JavaScript**: Core game logic and mechanics
- **HTML5 Canvas**: Rendering surface
- **CSS3**: UI styling with animations and neon effects
- **Web Audio API**: Dynamic sound effects

## 📁 Project Structure

```
3d-car-race-js/
├── index.html      # Main HTML file with game UI
├── game.js         # Core game logic and Three.js implementation
├── styles.css      # Styling with neon theme and animations
└── README.md       # This file
```

## 🎨 Visual Design

The game features a distinctive **cyberpunk neon aesthetic** with:
- Glowing cyan and magenta color scheme
- Animated text effects with glow animations
- Pulsing UI elements
- Real-time speedometer with animated needle
- Immersive dark gradient background

## 🌐 Browser Compatibility

- ✅ Chrome/Chromium (Recommended)
- ✅ Firefox
- ✅ Edge
- ✅ Safari (may have audio limitations)

**Note**: Modern browser with WebGL support required.

## 🎯 Game Objectives

1. Travel as far as possible without crashing
2. Maximize your score by:
   - Overtaking vehicles
   - Near misses with oncoming traffic
   - Avoiding pedestrians
   - Stopping at red lights
3. Master the turning mechanics at junctions
4. Challenge yourself to beat your high score!

## 📝 License

This project is open source and available for educational and personal use.

## 🤝 Contributing

Contributions, issues, and feature requests are welcome!

## 👨‍💻 Author

Created by [@zaselalk](https://github.com/zaselalk)

---

**Enjoy the race! 🏁**
