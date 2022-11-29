---
title: "Hijacking infrared to make a dumb device smart"
date: 2022-11-26T21:44:40+01:00
draft: true
math: true
imgs: 
    - cover.jpg
---
<!-- <script>
    document.addEventListener('DOMContentLoaded', () => {
        [...document.getElementsByClassName('responsive-iframe')].forEach((iframe) => {
            let reload_iframe = () => {
                // Reload iframes content
                let iframe_src = iframe.src
                iframe.src = '';
                iframe.src = iframe_src;
                wokwi_details.removeEventListener('toggle', reload_iframe);
            };
            let wokwi_details = iframe.parentElement.parentElement;
            wokwi_details.addEventListener('toggle', reload_iframe);
        });
    });
</script> -->


<p align="center">
    <img src="tv_side.jpg" width="45%"/>
    <img src="tv_front.jpg" width="45%"/>
</p>

I own a very old 'flat' screen television from 2009. One of the reason this TV is still kicking around is because I have a strange sentimental affection for it. Another is that I have written [automation](https://github.com/kennedn/tvcom) for it that works really well and it would be a pain  to migrate away from it.

It does have a problem however, the TV tends to hit resonance frequency very often with its built-in speakers, causing the body of the unit to vibrate something awful and produce some ear wrenching sounds as a result.

So, to extend the longevity of this relic, I decided to invest in a cheapo soundbar, the [Majority Snowdon II](https://www.majority.co.uk/soundbars/snowdon/). This has worked to fix the resonance issue but has somewhat moved my problems laterally as it came with its own caveats. Namely, its a big dumb dumb.

That's right, it's not a smart device, its about as dumb as they come in 2022. It has an infrared remote, some physical buttons and that's it! However I had a plan when I bought this device. I thought I could probably make it smarter and after losing the remote down the side of the couch for the 87th time I decided to crack it open and see what could be done.

<details>
<summary>Table of Contents</summary>

- [Disassembly](#disassembly)
- [Goal and Testing setup](#goal-and-testing-setup)
  - [Setup](#setup)
- [Decoding the Indicator LED](#decoding-the-indicator-led)
  - [Wiring](#wiring)
  - [Code](#code)
  - [Demo](#demo)
- [Mimicing an Infrared Remote](#mimicing-an-infrared-remote)
  - [Wiring](#wiring-1)
  - [Code](#code-1)
  - [Demo](#demo-1)
</details>

# Disassembly

My original intentions when cracking this open was to start looking at datasheets for on-board chips to try and find a foothold somewhere on the board. However, looking at the mainboard, I was very quickly struck with an idea.

<p align="center">
    <img src="motherboard_front.jpg" width="41%"/>
    <img src="motherboard_front_closeup.jpg" width="50%"/>
</p>

There are two very cleanly labelled connection jacks that go to the daughter board. And the daughter board just happens to host all of the interfacing options on the device: the physical buttons, an indicator LED and the infrared receiver.

So lets just hijack these pre-existing interfaces for our own purposes!

# Goal and Testing setup

Now that we know the project has some feasbility, lets lay the ground rules for what success will look like. We want to be able to:
- Get the current state of Snowdon using the RGB lines from the status LED
- Mimic the signal coming in on the Infrared line so that we can send our own infrared commands to Snowdon

We also want to have control over the new super powers we will bestow upon the Snowdon. At this point, I had already earmarked the Raspberry Pi Pico W as the microcontroller of choice for this project for a few reasons: 
1. It has a WiFi chip, which means we can turn the snowdon into a true IoT device
2. It has [Programmable IO](https://hackspace.raspberrypi.com/articles/what-is-programmable-i-o-on-raspberry-pi-pico), which means we can write our own driver for the Infrared signalling.
3. It accepts 5v power in, which means we can power it directly from the mainboard
4. I had a bunch of them in my desk drawer 😀 

## Setup



# Decoding the Indicator LED

The daughter board has a 4 pin RGB indicator LED that can display a number of colors. The LED is common anode which means it is active low. Each of the 3 color pins are broken out on a connection jack on the mainboard. The user manual actually tells us the possible colors and their meaning too:

|State           	|LED Indicator Light|
|-------------------|-------------------|
|Power Off 	        |Red|
|AUX Mode 	        |White|
|Line In Mode 	    |Green|
|Optical Mode 	    |Yellow|
|Bluetooth Ready 	|Flashing Blue|
|Bluetooth Connected|Blue|


This is enough information for us to decode which color is currently being displayed on the LED and infer a state from it. 

We can achieve this easily by wiring 3 consecutive GPIO pins to the mainboard.

## Wiring

<table style="width:100%; margin-left: auto; margin-right: auto">
<tr><td style="width:30%; padding: 1px;">

```goat
 Snowdon         Rasp Pi
-----------.   .----------
       GND +---+ GND
  BLUE_LED +---+ GPIO 19 
 GREEN_LED +---+ GPIO 18 
   RED_LED +---+ GPIO 17  
       +5V +---+ VSYS    
-----------'   '----------
```
</td>
<td style="width:70%; padding 1px;">
    <img src="snowdon_fritzing_led.png" />
</tr>
</table>

## Code

Since we are only concerned with 3 pins (17,18 & 19), we can create a 32 bit bit-mask that will select only these pins:

```c
#define RGB_BASE_PIN 17
const uint32_t RGB_MASK = 1 << RGB_BASE_PIN |     // Pin 17
                          1 << RGB_BASE_PIN + 1 | // Pin 18
                          1 << RGB_BASE_PIN + 2;  // Pin 19
```

Then in our main loop we can initialise the pins as input with our mask:

```c
gpio_init_mask(RGB_MASK);
```

And then get the current value of each of the 3 pins by ANDing the value of the GPIO register with our mask. We then shift this to the right to clear out the left over zeros from our AND operation and end up with a 3 bit value representing our 3 color lines:

```c
uint32_t gpio = (gpio_get_all() & RGB_MASK) >> RGB_BASE_PIN;
```

Finally, we can pass this value into a switch statement and based on the value of the 3 color bits, we can print a different message:

```c
switch(gpio) {
    case 0b110: // red
        printf("off\n");
        break;
    case 0b100: // yellow
        printf("optical\n");
        break;
    case 0b000: // white
        printf("aux\n");
        break;
    case 0b101: // green
        printf("line-in\n");
        break;
    case 0b011: // blue
        printf("bluetooth\n");
        break;
    case 0b111: // off
        printf("none\n");
        break;
    default:
        printf("unknown\n");
    }
```

<details>
  <summary>Full code</summary>

```c
#include <stdio.h>
#include "pico/stdlib.h"

#define RGB_BASE_PIN 17
const uint32_t RGB_MASK = 1 << RGB_BASE_PIN |        // Pin 17
                          1 << RGB_BASE_PIN + 1 |    // Pin 18
                          1 << RGB_BASE_PIN + 2;     // Pin 19

int main() {
    stdio_init_all();
    // Enable pins 17, 18 & 19 as input 
    gpio_init_mask(RGB_MASK);
    uint32_t gpio;
    while (true) {
        // Extract desired bits from GPIO with RGB_MASK and shift right
        // This gives us a 3 bit value in the form 0b<b><g><r>
        gpio = (gpio_get_all() & RGB_MASK) >> RGB_BASE_PIN;
        // Perform comparisons on the 3 bits to determine the state of the RGB LED
        switch(gpio) {
            case 0b110: // red
                printf("off\n");
                break;
            case 0b100: // yellow
                printf("optical\n");
                break;
            case 0b000: // white
                printf("aux\n");
                break;
            case 0b101: // green
                printf("line-in\n");
                break;
            case 0b011: // blue
                printf("bluetooth\n");
                break;
            case 0b111: // off
                printf("none\n");
                break;
            default:
                printf("unknown\n");
        }
        sleep_ms(500);
    }
    return 0;
}
```
</details> 

## Demo

> Toggle switches on the breadboard to hardcode an RGB value


<div>
    <div class="responsive-iframe-container">
        <iframe class="responsive-iframe" frameBorder="0" seamless="" sandbox="allow-top-navigation-by-user-activation allow-same-origin allow-forms allow-scripts" 
            src="https://wokwi.com/projects/349434548177601107">
            </iframe>
    </div>
    <a target="_blank" href="https://wokwi.com/projects/349434548177601107">
        <img src="https://shields.io/badge/-View%20on%20Wokwi-9C27B0?style=for-the-badge&logo=data%3Aimage%2Fpng%3Bbase64%2CiVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHeAAAC63pUWHRSYXcgcHJvZmlsZSB0eXBl%0AIGV4aWYAAHja7ZdbktwgDEX%2FWUWWgCSExHIwmKrsIMvPBT%2Bme2byquQnVW3KgIUsyTqCngn7t68j%0AfMFFJXNIap5LzhFXKqlwxcTjcZXVU0yrX1c6l%2FD8JA%2F3AkMkGOV4tHrqV8j17YXLB23P8uDnCvtp%0AiG7D65Lpec77Y5CQ8yGnM5JQ9mOSi9tjqNtpqF0h%2B9ud7rDOz8VzeBIYstQVjoR5F5K4ej8ikHmz%0AVEgIPYtDj6RgLmIBg8oVCRLy9HnXGONjgp6SfM3C%2B%2Bzfs3fJ53rK5V0u85kjTD5dIH0nl9sNPzqW%0AOyJ%2BXjC5TH1M8hjdx9iPr6spI6P5rKiVbLrMQHFDymW9ltEMt2JuqxU0jzU2IO%2BxxQ2tUSEGlREo%0AUadKg%2FY1NmoIMfHOhpG5sSyZi3HhJpNTmo0GG4h1cfBrvAegS8J3LLT8luWvkcNzJ6gywRgt%2FD9o%0A4WeLf9LCGG2miKLfuUJcPOsaYUxys4cWgNA4uelK8NVO%2FPGhflCqIKgrzY4PrHE7TGxKb7Uli7NA%0ATzEeW4iC9dMAUgTfimCwBRLFTKKUKRqzESGPDkAVkbMk3kCAVLkjSE4iOI%2BMsWXgG%2B8YLV1WzjzF%0AOJsAQiWLgQ32FGClpKgfS44aqiqaVDWrqQctWrPklDXnbHkectXEkqllM3MrVl08uXp2c%2FfitXAR%0AnIFacrHipZRaOVQ4qrBVoV8h2XiTLW265c0238pWG8qnpaYtN2veSqudu3QcEz13695LrzuFHSfF%0Annbd826772WvA7U2ZKShIw8bPsqoN7WT6of2B9TopMaL1NSzmxqkwewyQfM40ckMxDgRiNskgILm%0AySw6pcST3GQWC2NTKCNInWxCp0kMCNNOrINudm%2FkfotbUP8tbvwrcmGi%2BxfkAtB95PYJtT5%2F59oi%0AduzCmdMo2H3QqewBd4zo%2FnZ8GXoZehl6GXoZehl6Gfr%2FDcnAHw%2F4JzZ8B%2BCTnVMIfBeOAAABhGlD%0AQ1BJQ0MgcHJvZmlsZQAAeJx9kT1Iw0AcxV9Ti6IVETuIVMhQnSyIijhqFYpQodQKrTqYXPoFTRqS%0AFBdHwbXg4Mdi1cHFWVcHV0EQ%2FABxdHJSdJES%2F5cUWsR4cNyPd%2Fced%2B8AoV5mqtkxDqiaZaTiMTGT%0AXRU7X9GDMPoxjIDETH0umUzAc3zdw8fXuyjP8j735%2BhVciYDfCLxLNMNi3iDeHrT0jnvE4dYUVKI%0Az4nHDLog8SPXZZffOBccFnhmyEin5olDxGKhjeU2ZkVDJZ4ijiiqRvlCxmWF8xZntVxlzXvyFwZz%0A2soy12mGEccilpCECBlVlFCGhSitGikmUrQf8%2FAPOf4kuWRylcDIsYAKVEiOH%2FwPfndr5icn3KRg%0ADAi82PbHCNC5CzRqtv19bNuNE8D%2FDFxpLX%2BlDsx8kl5raZEjoG8buLhuafIecLkDDD7pkiE5kp%2Bm%0AkM8D72f0TVlg4BboXnN7a%2B7j9AFIU1eJG%2BDgEBgtUPa6x7u72nv790yzvx9QnXKZQyVjJQAAAAZi%0AS0dEAP8A%2FwD%2FoL2nkwAAAAlwSFlzAAALEwAACxMBAJqcGAAAAAd0SU1FB%2BYLHBMlNlj%2F014AAAa9%0ASURBVHja7Zt5rN1DFMc%2F71mqulhaRWtL0VYrSqpFLa0WEVSJtUVEYk0F8Q8VGjuJPZaI8EcjtASh%0A9iBKrfVsVbRoSy1RXdDWa7V97%2BuPzkt%2BGWd%2Bd2bufY%2B%2Bvm9yk3vnd86Z%2BZ05M3POmXPrJLExo56N%0AHB0K6FDARo5N2%2Bl71QEDgMOAHsA8YDqw6F%2BUktrb52BJH%2BnfaJb0oqSDivR17ewYPAl4HNi8hKYJ%0AOAd4FPjPFNAJGA0McoNdCLwA%2FF6FzD2AWUDnCNomYH%2Fgs7Y2z60k3SxpiWGiqyTdL2nbTNlPKg2P%0AW0ugDjgIOMFpqBMwB5jmZqipihnaHpgB7FmB7htgOLA0QXZXYIkbbxE%2FuiXRCFwGbFN4tgroU9Tg%0AUEmflmjsW38DSfhsIemLhNmZIWmTBPn7GjKmSupUoBlr0ExoeXiEM8FKWC7psAwFXBiQt0bS0sCz%0AsQnyhxn8Iz2a3QyaafVAT2AqsEWEqXUDpkTSFnGG0fY0sCPQy8n0MS5B%2Fi9As9c21vt9oME3GEl3%0ABGbgHWdGa41nFybMzqaSFnn8Cz3z7C%2BpyaP5KtHK5hrn%2FsPOus9z1uvjCyR9bTy4pCB4UkA5sQPb%0AXNIyj3%2BmQecvwQWJCjg%2F8RRokjQetw6LeNcT3N0Y3JLEwX1pDOD6wka3g2FpMxL72FLSysiXb5Z0%0AsSTqgXXeuujhHSd%2FGQ5Kc%2BIe8JrRdg0wF3gEeNGIS6Yn9tEIzI6g%2BxM4DbivJRZoMDT0lqR%2Bkuok%0ADZa0znv%2BduLs7GFYWhnWSuqbcdq8VUHu65J2LfIgaWIJw0%2BSVhvt52YM7oIEBTyUIb9O0vyAvAWS%0ARll8SOoq6fuEwf0mqUumQzQxcKr4yPE1ti7xNYaF%2BOqBlcDpwN%2BRa%2B0Bty%2Fk4BZgGNBQge7HDNkj%0AAu23ATODXAVtHFBiQkUcUqPA6OySXXtohrzJAc%2B1NLgqpsQ%2BBPYBbnQ7aggrahQST3aWZ2HvjMzW%0AmEAfy0o5A5rZ1XliFo6rcYg81ejj6UQZowwZf0vapRJvKCn6g8uuWGt9vxonR64F1nptoytkdajg%0A9%2BN8i4XVZIW%2FBm5K2GxyMQd42WvbCjg4kn8Tl7%2Fw8UgUdwUT6S5phWdaq6s4BkOf4w0TvieS90iD%0A92cXhJG7BFqwHHjCyOcdUWMreNXYrI6LvLewwuaHDBc%2FywKQtJ%2Bh4WdaIV94Z0RSwwq1%2FzD4dort%0AN0bDnwIfe21Hu3VaS0yOTKRUGsd04KdaX4096f3u7DqvJXY3kq5j3SYXwqlG29SkXiNNpa%2BRsXmq%0ARqbfRdJjJZ7nUQG%2BbY08xXJJ26T0H2sB891SKOIooHuVsz7A%2BenjS2hOCbSPMXKTz6ZerqTcDj9o%0AJEjHVfHyx7qgaGDELm8p%2BjSjbUryKBLMpYcRyr6ZafZXGEmWMpxljMVPsCyOPftzlgDupmaG13ao%0Au%2FFJCVruAm4NbG7rgOcAVTjrzwQ289qeij77q7gen2DMzqUJ2eHnS2a5QdIARzvfyOD2KciaZfAP%0AyrHGVIY%2BhunNjrjG6uHyiBZWS7rKk3F3iWs8yGV1i5jlUmKtrgAkvWEMbkQJfa9A4lWSfnUFDVaR%0Ag4%2B%2FJG0n6Qbj2aTcYziH6fKE%2BH1nSfMCL%2F%2BBpN4ll6mNgQvPBUaOf0BbKsCKDda59DnedVfo5V9x%0AtQJl%2FcyKPCE%2BqMYRy6kS%2B9zdrfsx%2BRSgi%2FvdD3gT6Gvwv%2BwivT8jTp0YTKnGE8tRQDPwndG%2Blzsm%0AJzjvbsfADdFJkcdVr8jxzKyqnCyzRuj9wHVzpVT3EGBxZGD0ratYqYQGYGRuqj63UHLPRPo1zuwX%0AR9LfEvnyuFKeK9tyCZzsLlBTcKOr4IrB1kaSc40rqHg3sHzOI7foM3HX7O187hQsTcwhjjRkXF14%0APjwwhoFtcQpMdCU1KegGbJlAb21%2BLxW%2Bv%2Bcqvnz0bu0lUAecGBjcJODewNG1WUTIi1e%2B5qOPsUxy%0Aj83sJdAzYOLFIOTwAM2YhH76G75%2Bg%2Bu%2F3pXq%2Ban6RkmdW3sJdAu0Dy18X1BSxRWLuYacIcCvrK%2F2%0Afo%2F1hZF%2BJmhVa1tA95J6gTPcje59gU0wdXYuSthkG3ND4dRYoC5QUVYJ12UMrD6i3KXlAvToamKB%0AnAqPFHznLCdncL0kTSup8nrFlchWlZVOdYW7OtezfwTtMnfL%2B1mVmePhwDHATs4hmufSZnNqcRmR%0AEwv0c0FPWbDyvUtbz%2BZ%2FjhxX%2BBvgAOB149nvwO3A4A3h5auJBlsco72BUawvZvjE%2Beqr2YDQ3v4z%0A1GbhcIcCOhTQoYD2gX8AFHyG5b13Z5wAAAAASUVORK5CYII%3D%0A"></img>
    </a>
<div>

# Mimicing an Infrared Remote

The infrared (IR) protocol used by the Snowdon and indeed in the majority of consumer products is called NEC. When you press a button on your remote, a single NEC message will be sent, carrying 32 bits (uint32_t) of information:
<br><br>

- 8 bit device address
- 8 bit device address (logical inverse)
- 8 bit command
- 8 bit command (logical inverse)
  
<br>
The full message looks like this:

<p align="center">
    <img src="nec_protocol.png" width="100%"/>
</p>

And consists of the following:
<br>

- 9ms (562.5us x 16) leading LOW pulse 
- 4.5ms (562.5us x 8) HIGH pulse
- 32 bits of information
- 562.5us trailing LOW pulse

<br>
Each bit in the message starts with a LOW pulse for 562.5us, followed by:

- If the bit to be encoded is LOW, a HIGH pulse for 562.5us
- If the bit to be encoded is HIGH, a HIGH pulse for 1.6ms (562.5us x 3)

<br>

>It is worth noting there are a few nuances with the NEC protocol when transmitting normally via an LED:
>- When sent via an LED the message is inverted to what we see in the diagram
>- When sent via an LED the message is modulated with a 38khz carrier wave
>
>We can safely ignore both of these facts because we will be circumventing the usual front door of an IR LED and directly connecting our Pico to the receiving IR line on the Snowdon mainboard.

Now that we understand a little about the NEC protocol, we can wire up the Pico to the Snowdon's IR line

## Wiring


<table style="width:100%; margin-left: auto; margin-right: auto">
<tr><td style="width:35%; padding: 1px;">

```goat
Snowdon  220Ω    Rasp Pi
------.   ___  .----------
   IR +--|___|-+ GPIO 16  
  GND +--------+ GND
  +5V +--------+ VSYS    
------'        '----------
```
</td>
<td style="width:65%; padding 1px;">
    <img src="snowdon_fritzing_ir.png" />
</tr>
</table>

> The 220Ω resistor is required to give priority to the IR transceiver on the daughterboard. Otherwise legitimate IR codes sent via the remote control may get dropped

## Code

To achieve the timing requirements of the protocol, we are going to be writing a Programmable IO (PIO) assembly program that will take a 32-bit unsigned integer (uint32_t) as input, translate it into a a NEC formatted message and broadcast it on GPIO 16.


>PIO is a bit of a hard nut to crack so here are some suggested materials if its your first PIO rodeo:
>- [Youtube - Raspberry Pi Pico's PIO](https://www.youtube.com/watch?v=yYnQYF_Xa8g)
>- [Youtube - Raspberry Pi Pico and RP2040](https://www.youtube.com/watch?v=OLV-TSRTTE8&list=PL_tws4AXg7auiZHZsL-qfrXoMiUONBB0U)
>- [PDF - Pico C SDK, Section 3](https://datasheets.raspberrypi.com/pico/raspberry-pi-pico-c-sdk.pdf)

<br>
The first thing we are going to configure for our driver is side set. Side set allows us to drive up to 5 consecutive pins as a side effect of a PIO ASM instruction. For our purposes we are only interested in driving a single GPIO pin with our IR data, so we will declare this to the compiler with a label:

```asm
.side_set 1
```
> Side setting <i>steals</i> bits from the delay function in PIO. <i>Stealing</i> 1 bit for side setting, as we are doing, reduces this maximum delay value from 31 ticks to 15 ticks

<br>
In our init function we also need to perform some setup to assosiate the variable <b>pin</b> (GPIO 16) with the side set function:

```c
sm_config_set_sideset_pins(&c, pin);
```

<br>
We also need to perform some setup functions to enable our pin as output and give it an initial value:

```c
pio_gpio_init(pio, pin);                                // Set pin function to GPIO
pio_sm_set_consecutive_pindirs(pio, sm, pin, 1, true);  // Set the pin direction to output 
pio_sm_set_pins_with_mask(pio, sm, 1u << pin, 1);       // Set the initial value of the pin to 1 (HIGH)
gpio_pull_up(pin);                                      // Set the default value of the pin to 1 (HIGH)

```
<br>
Lastly, we need to configure the clock. Looking at the timing diagram, our first instinct may be to set the clock to ~560us. so that each PIO instruction takes ~560us to execute. However, as will become evident later on, we actually need the flexibility to perform 2 instructions per ~560us window. So that is what we will set the clock to:

```c
// 2 ticks per 560us window 
float div = clock_get_hz(clk_sys) / (2 * (1 / 562.5e-6f));
sm_config_set_clkdiv(&c, div);
```
<br>
<br>

The body of the PIO program looks like this:

```assembly 
.wrap_target
    pull side 1
pulse_init:
    nop side 0 [15] 
    nop side 0 [15]         ; 9ms on 
    nop side 1 [15]         ; 4.5ms delay
next:
    out y 1 side 0          ; Read next bit from OSR into y, side set 0 for 1 tick (280us)
    jmp !y short side 0     ; If y == 0, goto short,  side set 0 for 1 tick (280us)
long:
    jmp bit_loop side 1 [4] ; Side set 1 for 5 ticks (1400us)
short:
    nop side 1              ; Side set 1 for 1 tick (280us)
bit_loop:
    jmp !osre next side 1   ; goto next if osr is not empty, side set 1 for 1 tick (280us)
end_pulse:
    nop side 0 [1]          ; Side set 0 for 2 ticks (560us)
.wrap
```
<br>
Let's disect this to understand how we are achieving NEC transmission.
<br>
<br>

```assembly
pull side 1
```
The `pull` instruction will pull 32 bits into the program as input. This call will block until we push a NEC message onto the FIFO. Additionally we:
- Use side set to drive GPIO 16 HIGH for 1 tick
<br>
<br>

```assembly
pulse_init:
    nop side 0 [15] 
    nop side 0 [15]         ; 9ms on 
    nop side 1 [15]         ; 4.5ms delay
```
We then enter the `pulse_init` label, where we:
- Execute the `nop` instruction which does nothing for a single tick. 
- Delay each `nop` for 15 ticks, such that each instruction takes 16 ticks total. 
- Use side set to drive GPIO 16 LOW for 32 ticks (9ms) and then HIGH for 16 ticks (4.5ms).

 <img src="nec_protocol_1.png" width="60%"/>

```assembly
next:
    out y 1 side 0          ; Read next bit from OSR into y, side set 0 for 1 tick (280us)
    jmp !y short side 0     ; If y == 0, goto short,  side set 0 for 1 tick (280us)
```
We fall through to the `next` label, where we:
- Pop one bit of our input into the `y` register.
- Do a conditional jump, if the bit's value is 0 we jump to the `short` label.
- Side set 0 for both instructions, achieving our initial LOW pulse for the first bit.
<br>
<br>
```assembly
long:
    jmp bit_loop side 1 [4] ; Side set 1 for 5 ticks (1400us)
```
If we did not conditionally jump, then we fall through to the `long` label, where we:

- Unconditionally jump to the bitloop label.
- Side set 1 with a 4 tick delay, totalling 5 ticks
<br>
<br>
```assembly
short:
    nop side 1              ; Side set 1 for 1 tick (280us)
```
Else, we conditionally jumped to the `short` label, where we:
- Do nothing (`nop`). Due to the positioning of our labels we can simply fall through to the `bit_loop` label
- Side set 1 on GPIO 16 for a single tick
<br>
<br>

```assembly
bit_loop:
    jmp !osre next side 1   ; goto next if osr is not empty, side set 1 for 1 tick (280us)
```
Regardless of our branching path, we end up in the `bit_loop` label. Where we:
- Conditionally jump back up to the `next` label as long as we still have input bits left to transcode
- Side set 1 on GPIO 16 for a single tick. This means we have driven the GPIO HIGH for 6 ticks if we got here via `long`, or 2 ticks via `short`!
<br>
<br>
<img src="nec_protocol_2.png" width="60%"/>

We then start again from `next` until we have processed all 32 bits:
<p align="center">
    <img src="nec_protocol.gif" width="100%"/>
</p>


```assembly
end_pulse:
    nop side 0 [1]          ; Side set 0 for 2 ticks (560us)
```
After all bits have been exhausted, we finally enter the `end_pulse` label, where we:
- Do nothing for a single tick
- Side set 0 on GPIO 16 for 2 ticks 
- Wrap back around to the first pull instruction to wait for next input


<p align="center">
    <img src="nec_protocol_3.png" width="100%"/>
</p>

<details>
  <summary>Full code</summary>

```assembly
; Implements an inverted NEC infrared protocol WITHOUT carrier signal
; For use in wired connection to IR line.  Each instruction is 280us
.program nec
.side_set 1
.wrap_target
    pull side 1
pulse_init:
    nop side 0 [15] 
    nop side 0 [15]         ; 9ms on 
    nop side 1 [15]         ; 4.5ms delay
next:
    out y 1 side 0          ; Read next bit from OSR into y, side set 0 for 1 tick (280us)
    jmp !y short side 0     ; If y == 0, goto short,  side set 0 for 1 tick (280us)
long:
    jmp bit_loop side 1 [4] ; Side set 1 for 5 ticks (1400us)
short:
    nop side 1              ; Side set 1 for 1 tick (280us)
bit_loop:
    jmp !osre next side 1   ; goto next if osr is not empty, side set 1 for 1 tick (280us)
end_pulse:
    nop side 0 [1]          ; Side set 0 for 2 ticks (560us)
.wrap

% c-sdk {
#include "hardware/clocks.h"
static inline void nec_transmit_program_init(PIO pio, uint sm, uint offset, uint pin) {
    pio_sm_config c = nec_program_get_default_config(offset);
    sm_config_set_sideset_pins(&c, pin);

    pio_gpio_init(pio, pin);
    pio_sm_set_consecutive_pindirs(pio, sm, pin, 1, true);
    pio_sm_set_pins_with_mask(pio, sm, 1u << pin, 1);
    gpio_pull_up(pin);
    
    sm_config_set_out_shift(&c, true, false, 32);
    
    // 2 ticks per 560us window 
    float div = clock_get_hz(clk_sys) / (2 * (1 / 562.5e-6f));
    sm_config_set_clkdiv(&c, div);

    // Init the pio state machine with PC at offset
    pio_sm_init(pio, sm, offset, &c);
    // Start sm
    pio_sm_set_enabled(pio, sm, true);
}
%}
```
</details>

## Demo
This simulation demonstrates our driver's ability to mimic an infrared remote. When the switch is toggled left, it will accept input directly from the IR remote via the IR receiver.
<br>
<br>
However, when the switch is toggled to the right, we see that our PIO program is sending a random remote code on GPIO 27 every 500ms:
<details>
<summary>Code</summary>

```c
#define TX_PIN 27
uint32_t remote_codes[] = {
    0x5da2ff00,  //POWER                                                            
    0xdd22ff00,  //TEST                                                             
    0xfd02ff00,  //PLUS                                                             
    0x3dc2ff00,  //BACK                                                             
    0x1de2ff00,  //MENU
    0x6f90ff00,  //NEXT
    0x57a8ff00,  //PLAY
    0x1fe0ff00,  //PREV
    0x9768ff00,  //0
    0x6798ff00,  //MINUS
    0x4fb0ff00,  //C
    0x857aff00,  //3
    0xe718ff00,  //2
    0xcf30ff00,  //1
    0xef10ff00,  //4
    0xc738ff00,  //5
    0xa55aff00,  //6
    0xad52ff00,  //9
    0xb54aff00,  //8
    0xbd42ff00,  //7
};
...
while (true) {
    pio_sm_put_blocking(PIO_INSTANCE, tx_sm, 
                        remote_codes[rand() % ARRAY_SIZE(remote_codes)]);
...
    sleep_ms(500);
}
```
</details>

<br>
<br>
<div>
    <div class="responsive-iframe-container">
        <iframe class="responsive-iframe" frameBorder="0" seamless="" sandbox="allow-top-navigation-by-user-activation allow-same-origin allow-forms allow-scripts" 
            src="https://wokwi.com/projects/349529974649127506">
            </iframe>
    </div>
    <a target="_blank" href="https://wokwi.com/projects/349529974649127506">
        <img src="https://shields.io/badge/-View%20on%20Wokwi-9C27B0?style=for-the-badge&logo=data%3Aimage%2Fpng%3Bbase64%2CiVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHeAAAC63pUWHRSYXcgcHJvZmlsZSB0eXBl%0AIGV4aWYAAHja7ZdbktwgDEX%2FWUWWgCSExHIwmKrsIMvPBT%2Bme2byquQnVW3KgIUsyTqCngn7t68j%0AfMFFJXNIap5LzhFXKqlwxcTjcZXVU0yrX1c6l%2FD8JA%2F3AkMkGOV4tHrqV8j17YXLB23P8uDnCvtp%0AiG7D65Lpec77Y5CQ8yGnM5JQ9mOSi9tjqNtpqF0h%2B9ud7rDOz8VzeBIYstQVjoR5F5K4ej8ikHmz%0AVEgIPYtDj6RgLmIBg8oVCRLy9HnXGONjgp6SfM3C%2B%2Bzfs3fJ53rK5V0u85kjTD5dIH0nl9sNPzqW%0AOyJ%2BXjC5TH1M8hjdx9iPr6spI6P5rKiVbLrMQHFDymW9ltEMt2JuqxU0jzU2IO%2BxxQ2tUSEGlREo%0AUadKg%2FY1NmoIMfHOhpG5sSyZi3HhJpNTmo0GG4h1cfBrvAegS8J3LLT8luWvkcNzJ6gywRgt%2FD9o%0A4WeLf9LCGG2miKLfuUJcPOsaYUxys4cWgNA4uelK8NVO%2FPGhflCqIKgrzY4PrHE7TGxKb7Uli7NA%0ATzEeW4iC9dMAUgTfimCwBRLFTKKUKRqzESGPDkAVkbMk3kCAVLkjSE4iOI%2BMsWXgG%2B8YLV1WzjzF%0AOJsAQiWLgQ32FGClpKgfS44aqiqaVDWrqQctWrPklDXnbHkectXEkqllM3MrVl08uXp2c%2FfitXAR%0AnIFacrHipZRaOVQ4qrBVoV8h2XiTLW265c0238pWG8qnpaYtN2veSqudu3QcEz13695LrzuFHSfF%0Annbd826772WvA7U2ZKShIw8bPsqoN7WT6of2B9TopMaL1NSzmxqkwewyQfM40ckMxDgRiNskgILm%0AySw6pcST3GQWC2NTKCNInWxCp0kMCNNOrINudm%2FkfotbUP8tbvwrcmGi%2BxfkAtB95PYJtT5%2F59oi%0AduzCmdMo2H3QqewBd4zo%2FnZ8GXoZehl6GXoZehl6Gfr%2FDcnAHw%2F4JzZ8B%2BCTnVMIfBeOAAABhGlD%0AQ1BJQ0MgcHJvZmlsZQAAeJx9kT1Iw0AcxV9Ti6IVETuIVMhQnSyIijhqFYpQodQKrTqYXPoFTRqS%0AFBdHwbXg4Mdi1cHFWVcHV0EQ%2FABxdHJSdJES%2F5cUWsR4cNyPd%2Fced%2B8AoV5mqtkxDqiaZaTiMTGT%0AXRU7X9GDMPoxjIDETH0umUzAc3zdw8fXuyjP8j735%2BhVciYDfCLxLNMNi3iDeHrT0jnvE4dYUVKI%0Az4nHDLog8SPXZZffOBccFnhmyEin5olDxGKhjeU2ZkVDJZ4ijiiqRvlCxmWF8xZntVxlzXvyFwZz%0A2soy12mGEccilpCECBlVlFCGhSitGikmUrQf8%2FAPOf4kuWRylcDIsYAKVEiOH%2FwPfndr5icn3KRg%0ADAi82PbHCNC5CzRqtv19bNuNE8D%2FDFxpLX%2BlDsx8kl5raZEjoG8buLhuafIecLkDDD7pkiE5kp%2Bm%0AkM8D72f0TVlg4BboXnN7a%2B7j9AFIU1eJG%2BDgEBgtUPa6x7u72nv790yzvx9QnXKZQyVjJQAAAAZi%0AS0dEAP8A%2FwD%2FoL2nkwAAAAlwSFlzAAALEwAACxMBAJqcGAAAAAd0SU1FB%2BYLHBMlNlj%2F014AAAa9%0ASURBVHja7Zt5rN1DFMc%2F71mqulhaRWtL0VYrSqpFLa0WEVSJtUVEYk0F8Q8VGjuJPZaI8EcjtASh%0A9iBKrfVsVbRoSy1RXdDWa7V97%2BuPzkt%2BGWd%2Bd2bufY%2B%2Bvm9yk3vnd86Z%2BZ05M3POmXPrJLExo56N%0AHB0K6FDARo5N2%2Bl71QEDgMOAHsA8YDqw6F%2BUktrb52BJH%2BnfaJb0oqSDivR17ewYPAl4HNi8hKYJ%0AOAd4FPjPFNAJGA0McoNdCLwA%2FF6FzD2AWUDnCNomYH%2Fgs7Y2z60k3SxpiWGiqyTdL2nbTNlPKg2P%0AW0ugDjgIOMFpqBMwB5jmZqipihnaHpgB7FmB7htgOLA0QXZXYIkbbxE%2FuiXRCFwGbFN4tgroU9Tg%0AUEmflmjsW38DSfhsIemLhNmZIWmTBPn7GjKmSupUoBlr0ExoeXiEM8FKWC7psAwFXBiQt0bS0sCz%0AsQnyhxn8Iz2a3QyaafVAT2AqsEWEqXUDpkTSFnGG0fY0sCPQy8n0MS5B%2Fi9As9c21vt9oME3GEl3%0ABGbgHWdGa41nFybMzqaSFnn8Cz3z7C%2BpyaP5KtHK5hrn%2FsPOus9z1uvjCyR9bTy4pCB4UkA5sQPb%0AXNIyj3%2BmQecvwQWJCjg%2F8RRokjQetw6LeNcT3N0Y3JLEwX1pDOD6wka3g2FpMxL72FLSysiXb5Z0%0AsSTqgXXeuujhHSd%2FGQ5Kc%2BIe8JrRdg0wF3gEeNGIS6Yn9tEIzI6g%2BxM4DbivJRZoMDT0lqR%2Bkuok%0ADZa0znv%2BduLs7GFYWhnWSuqbcdq8VUHu65J2LfIgaWIJw0%2BSVhvt52YM7oIEBTyUIb9O0vyAvAWS%0ARll8SOoq6fuEwf0mqUumQzQxcKr4yPE1ti7xNYaF%2BOqBlcDpwN%2BRa%2B0Bty%2Fk4BZgGNBQge7HDNkj%0AAu23ATODXAVtHFBiQkUcUqPA6OySXXtohrzJAc%2B1NLgqpsQ%2BBPYBbnQ7aggrahQST3aWZ2HvjMzW%0AmEAfy0o5A5rZ1XliFo6rcYg81ejj6UQZowwZf0vapRJvKCn6g8uuWGt9vxonR64F1nptoytkdajg%0A9%2BN8i4XVZIW%2FBm5K2GxyMQd42WvbCjg4kn8Tl7%2Fw8UgUdwUT6S5phWdaq6s4BkOf4w0TvieS90iD%0A92cXhJG7BFqwHHjCyOcdUWMreNXYrI6LvLewwuaHDBc%2FywKQtJ%2Bh4WdaIV94Z0RSwwq1%2FzD4dort%0AN0bDnwIfe21Hu3VaS0yOTKRUGsd04KdaX4096f3u7DqvJXY3kq5j3SYXwqlG29SkXiNNpa%2BRsXmq%0ARqbfRdJjJZ7nUQG%2BbY08xXJJ26T0H2sB891SKOIooHuVsz7A%2BenjS2hOCbSPMXKTz6ZerqTcDj9o%0AJEjHVfHyx7qgaGDELm8p%2BjSjbUryKBLMpYcRyr6ZafZXGEmWMpxljMVPsCyOPftzlgDupmaG13ao%0Au%2FFJCVruAm4NbG7rgOcAVTjrzwQ289qeij77q7gen2DMzqUJ2eHnS2a5QdIARzvfyOD2KciaZfAP%0AyrHGVIY%2BhunNjrjG6uHyiBZWS7rKk3F3iWs8yGV1i5jlUmKtrgAkvWEMbkQJfa9A4lWSfnUFDVaR%0Ag4%2B%2FJG0n6Qbj2aTcYziH6fKE%2BH1nSfMCL%2F%2BBpN4ll6mNgQvPBUaOf0BbKsCKDda59DnedVfo5V9x%0AtQJl%2FcyKPCE%2BqMYRy6kS%2B9zdrfsx%2BRSgi%2FvdD3gT6Gvwv%2BwivT8jTp0YTKnGE8tRQDPwndG%2Blzsm%0AJzjvbsfADdFJkcdVr8jxzKyqnCyzRuj9wHVzpVT3EGBxZGD0ratYqYQGYGRuqj63UHLPRPo1zuwX%0AR9LfEvnyuFKeK9tyCZzsLlBTcKOr4IrB1kaSc40rqHg3sHzOI7foM3HX7O187hQsTcwhjjRkXF14%0APjwwhoFtcQpMdCU1KegGbJlAb21%2BLxW%2Bv%2Bcqvnz0bu0lUAecGBjcJODewNG1WUTIi1e%2B5qOPsUxy%0Aj83sJdAzYOLFIOTwAM2YhH76G75%2Bg%2Bu%2F3pXq%2Ban6RkmdW3sJdAu0Dy18X1BSxRWLuYacIcCvrK%2F2%0Afo%2F1hZF%2BJmhVa1tA95J6gTPcje59gU0wdXYuSthkG3ND4dRYoC5QUVYJ12UMrD6i3KXlAvToamKB%0AnAqPFHznLCdncL0kTSup8nrFlchWlZVOdYW7OtezfwTtMnfL%2B1mVmePhwDHATs4hmufSZnNqcRmR%0AEwv0c0FPWbDyvUtbz%2BZ%2FjhxX%2BBvgAOB149nvwO3A4A3h5auJBlsco72BUawvZvjE%2Beqr2YDQ3v4z%0A1GbhcIcCOhTQoYD2gX8AFHyG5b13Z5wAAAAASUVORK5CYII%3D%0A"></img>
    </a>
<div>



<p align="center">
    <img src="snowdon_fritzing.png" width="90%"/>
</p>

<details>
    <summary>Infrared example</summary>

</details>




- Options for interfacing
    - Decoding the RGB LED signal to determine status
    - NEC protocol overview
    - Writing a driver for NEC
    - Optional: Breaking out SWD on unused USB header
- HTTP overview 
- Writing a HTTP server on top of the TCP example
    - URI variable parsing
    - JSON parsing
    - Workarounds
