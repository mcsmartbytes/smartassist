import { createCanvas } from 'canvas';
import fs from 'fs';
import path from 'path';

const ICONS_DIR = './public/icons';

// Icon sizes needed for PWA
const sizes = [16, 32, 72, 96, 128, 144, 152, 180, 192, 384, 512];

// Create a professional-looking icon
function createIcon(size) {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');

  // Background gradient (professional indigo)
  const gradient = ctx.createLinearGradient(0, 0, size, size);
  gradient.addColorStop(0, '#4f46e5');
  gradient.addColorStop(1, '#3730a3');

  // Draw rounded rectangle background
  const radius = size * 0.2;
  ctx.beginPath();
  ctx.roundRect(0, 0, size, size, radius);
  ctx.fillStyle = gradient;
  ctx.fill();

  // Draw "SA" letters
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // Font size relative to icon size
  const fontSize = size * 0.4;
  ctx.font = `bold ${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;

  // Draw the text centered
  ctx.fillText('SA', size / 2, size / 2 + size * 0.03);

  // Add a subtle highlight
  ctx.beginPath();
  ctx.roundRect(size * 0.1, size * 0.08, size * 0.8, size * 0.15, size * 0.05);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
  ctx.fill();

  return canvas;
}

// Ensure directory exists
if (!fs.existsSync(ICONS_DIR)) {
  fs.mkdirSync(ICONS_DIR, { recursive: true });
}

// Generate all icon sizes
for (const size of sizes) {
  const canvas = createIcon(size);
  const buffer = canvas.toBuffer('image/png');

  let filename;
  if (size === 180) {
    filename = 'apple-touch-icon.png';
  } else {
    filename = `icon-${size}x${size}.png`;
  }

  const filepath = path.join(ICONS_DIR, filename);
  fs.writeFileSync(filepath, buffer);
  console.log(`Generated: ${filename}`);
}

// Create Safari pinned tab SVG
const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="102" fill="#4f46e5"/>
  <text x="256" y="280" font-family="-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif" font-size="200" font-weight="bold" fill="white" text-anchor="middle">SA</text>
</svg>`;

fs.writeFileSync(path.join(ICONS_DIR, 'safari-pinned-tab.svg'), svgContent);
console.log('Generated: safari-pinned-tab.svg');

console.log('\nAll icons generated successfully!');
