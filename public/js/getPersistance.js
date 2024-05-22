let backgroundColor = sessionStorage.getItem('lastColor') || `rgba(28,129,126, 0.7)`;

// Extract the numeric RGB values from the input string
let rgbValues = backgroundColor.match(/\d+/g);

// Check if the input string was in the expected RGB format
if (!rgbValues || rgbValues.length !== 3) {
    document.body.style.backgroundColor = backgroundColor;
} else {
    let [r, g, b] = rgbValues.map(Number);
    document.body.style.backgroundColor = `rgba(${r}, ${g}, ${b}, 0.7)`;
}