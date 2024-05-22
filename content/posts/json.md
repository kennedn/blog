---
title: "Using JSON on a microcontroller without understanding it"
date: 2024-05-14T11:10:53+01:00
draft: false
math: false
imgs: 
    - cover.gif
---

This year I was gifted a Badger 2040W. This device is essentially a Pi Pico attached to a black and white e-ink display. The device is supposed to be used as a wearable badge. My use case was a little different however.

Most of my lights and devices are wired into my [home automation api](https://github.com/kennedn/restate-go). This is great as I have a smartwatch that can control it all, but it's a poor user experience for others who have no such device. I decided therefore, to repurpose the badger as a home automation controller that anyone can use.

This culminated in the [restful-badger](https://github.com/kennedn/restful-badger) project, which permits an arbitrary number of RESTful 'tiles' to be configured. Each tile can control and get state over HTTP.

<p align="center">
    <img src="demo.gif" width=70%"/>
</p>

<script src="./mini-coi.js" scope="./"></script>
<link rel="stylesheet" href="https://pyscript.net/releases/2024.5.2/core.css">
<script type="module" src="https://pyscript.net/releases/2024.5.2/core.js"></script>

<script>
    let shadow_rules = [
        `.cm-gutters {display: none !important;}`,
        `.cm-scroller {max-height: 50vh !important;}`,
        `.ͼb {color: red !important;}`,
        `.ͼc {color: violet !important;}`,
        `.ͼg {color: #ff0 !important;}`,
        `.ͼe {color: #87ceeb !important;}`,
        `.ͼd {color: #f60 !important;}`
    ];
    let document_rules = [
        `.mpy-editor-output {border-top: 3px solid white; margin-top: 10px; padding-top: 10px; white-space: pre-wrap !important;}`,
        `.highlight {margin-bottom: 0px !important;}`
    ]
    let interval = setInterval(() => {
        let editor_boxes = document.querySelectorAll('.mpy-editor-box');
        if (editor_boxes.length < 4) {
            return;
        }
        document_rules.forEach(rule => {
            document.styleSheets[0].insertRule(rule, 0);
        });
        clearInterval(interval);
        [...editor_boxes].forEach(editor_box => {
            // Hide 'micropython' header
            editor_box.setAttribute("data-env", "");

            let shadow = editor_box.querySelector(".mpy-editor-input > div").shadowRoot;
            shadow_rules.forEach(rule => {
                shadow.styleSheets[0].insertRule(rule, 0);
            });

            let button = editor_box.querySelector(".mpy-editor-run-button");
            button.innerHTML += "<p>Run Code<p>";

            editor_box.querySelector(".mpy-editor-run-button").click()
        });
        // Hide line count
        // shadow.querySelector(".cm-gutters").style = "display:none;";
        // shadow.querySelector(".cm-scroller").style = "height: 50vh;";
        // [...shadow.querySelectorAll(".ͼe")].forEach(elm => {
        //     elm.style = "color: green !important;";
        // });

        // document.querySelector(".mpy-editor-output").style = "border-top: 3px solid white; margin-top: 10px; padding-top: 10px";
    }, 100);
</script>
# The problem

One of the major design decisions for the software was that the tiles should be configurable. I chose JSON as the data format for my tiles, a given tile may look something like this:

```json
{
    "name": "office",
    "image_idx": 1,
    "action_request": {
        "method": "POST",
        "endpoint": "/v2/meross/office",
        "json_body": "{\"code\": \"toggle\"}"
    },
    "status_request": {
        "method": "POST",
        "endpoint": "/v2/meross/office",
        "json_body": "{\"code\": \"status\"}",
        "key": "onoff",
        "on_value": "1",
        "off_value": "0"
    }
}
```

A major downside of using JSON however is that it is expensive to parse on an embedded system. But there is a way to have our cake and eat it too. A way to avoid the runtime cost of parsing JSON but still use it.

## Enter the humble byte array

Something that C is very good at parsing is bytes. If we could encode our JSON into a structured byte array and feed those bytes to the microcontorller instead, most of the heavy lifting would be done before we hit runtime. All that would be left to do on our microcontroller is some book keeping to make sure the right bytes end up in the correct place. 

The correct place being a couple of c structs, which will look like this:

```c
typedef struct RESTFUL_REQUEST_DATA_ {
    char *method;
    char *endpoint;
    char *json_body;
    char *key;
    char *on_value;
    char *off_value;
} RESTFUL_REQUEST_DATA;

typedef struct TILE_ {
    char *name;
    char image_idx;
    RESTFUL_REQUEST_DATA *action_request;
    RESTFUL_REQUEST_DATA *status_request;
} TILE;
```
Most programming languages can work with bytes, so we can leverage a high level language such as python to encode the JSON file.

We have 2 types of data to encode in our example JSON, an integer and several strings. Integer encoding is trivial and involves simply appending the integer to our byte array directly:

<script type="mpy-editor" target="integer">
    import array
    image_idx = 1
    buffer = array.array('B')
    buffer.append(image_idx)
    print(buffer)
</script>
<div class="highlight"><pre class="chroma" style="padding: 0; margin: 0;" id="integer"></pre></div>

For strings we must capture both the length and the contents of the string in the byte array to be able to effectively book keep later on in C:

<script type ="mpy-editor" env="string_env" setup>
    def xxd_print(buffer, bytes_per_line=16):
        bytes_per_line = bytes_per_line if bytes_per_line < len(buffer) else len(buffer)
        print("HEX", " " * 3 * (bytes_per_line - 1), "ASCII")
        for c in [buffer[i:i+bytes_per_line] for i in range(0,len(buffer),bytes_per_line)]:
            h = ' '.join(f'{n:02x}' for n in c)
            print(h," " * (3*bytes_per_line - len(h)), ''.join(chr(n) if 32 <= n <= 126 else '.' for n in c))
</script>
<script type="mpy-editor" env="string_env" target="string">
    import array

    def append_string(buffer, string):
        buffer.append(len(string))
        for c in string:
            buffer.append(ord(c))

    name = "office"
    buffer = array.array('B')
    append_string(buffer, name)
    xxd_print(buffer)
</script>
<div class="highlight"><pre class="chroma" style="padding: 0; margin: 0;" id="string"></pre></div>

Building on these concepts we can now encode our entire JSON example:
    
<script type ="mpy-editor" env="pyscript" setup>
    def xxd_print(buffer, bytes_per_line=16):
        bytes_per_line = bytes_per_line if bytes_per_line < len(buffer) else len(buffer)
        print("HEX", " " * 3 * (bytes_per_line - 1), "ASCII")
        for c in [buffer[i:i+bytes_per_line] for i in range(0,len(buffer),bytes_per_line)]:
            h = ' '.join(f'{n:02x}' for n in c)
            print(h," " * (3*bytes_per_line - len(h)), ''.join(chr(n) if 32 <= n <= 126 else '.' for n in c))
</script>
<script type="mpy-editor" env=pyscript target="encode">
    import json
    import array

    def append_string(buffer, string):
        buffer.append(len(string))
        for c in string:
            buffer.append(ord(c))

    tile_string = """
    {
        "name": "office",
        "image_idx": 1,
        "action_request": {
            "method": "POST",
            "endpoint": "/v2/meross/office",
            "json_body": "{\\"code\\": \\"toggle\\"}"
        },
        "status_request": {
            "method": "POST",
            "endpoint": "/v2/meross/office",
            "json_body": "{\\"code\\": \\"status\\"}",
            "key": "onoff",
            "on_value": "1",
            "off_value": "0"
        }
    }
    """

    tile = json.loads(tile_string)

    buffer = array.array('B')

    append_string(buffer, tile["name"])
    buffer.append(tile["image_idx"])

    request = tile["action_request"]
    append_string(buffer, request["method"])
    append_string(buffer, request["endpoint"])
    append_string(buffer, request["json_body"])

    request = tile["status_request"]
    append_string(buffer, request["method"])
    append_string(buffer, request["endpoint"])
    append_string(buffer, request["json_body"])
    append_string(buffer, request["key"])
    append_string(buffer, request["on_value"])
    append_string(buffer, request["off_value"])

    xxd_print(buffer)
</script>
<div class="highlight"><pre class="chroma" style="padding: 0; margin: 0;" id="encode"></pre></div>

## Using our binary data

We now have a binary format that contains all the information we need to be able to reconstruct the important parts of the JSON in C, but how do we get it into our C program? One method is to simply hard code it. 

By adding a little bit of printing logic to our python code we can output c syntax for a `char` byte array:

<script type="mpy-editor" env=c_printing target="c_printing">
    import json
    import array

    def append_string(buffer, string):
        buffer.append(len(string))
        for c in string:
            buffer.append(ord(c))

    tile_string = """
    {
        "name": "office",
        "image_idx": 1,
        "action_request": {
            "method": "POST",
            "endpoint": "/v2/meross/office",
            "json_body": "{\\"code\\": \\"toggle\\"}"
        },
        "status_request": {
            "method": "POST",
            "endpoint": "/v2/meross/office",
            "json_body": "{\\"code\\": \\"status\\"}",
            "key": "onoff",
            "on_value": "1",
            "off_value": "0"
        }
    }
    """

    tile = json.loads(tile_string)

    buffer = array.array('B')

    append_string(buffer, tile["name"])
    buffer.append(tile["image_idx"])

    request = tile["action_request"]
    append_string(buffer, request["method"])
    append_string(buffer, request["endpoint"])
    append_string(buffer, request["json_body"])

    request = tile["status_request"]
    append_string(buffer, request["method"])
    append_string(buffer, request["endpoint"])
    append_string(buffer, request["json_body"])
    append_string(buffer, request["key"])
    append_string(buffer, request["on_value"])
    append_string(buffer, request["off_value"])

    hex_string = ', '.join(f'0x{b:02x}' for b in buffer)

    print(
    f"""static const char tile_data[{len(buffer)}] = {{
        {hex_string}
    }};"""
    )
</script>
<div class="highlight"><pre class="chroma" style="padding: 0; margin: 0; white-space: pre-wrap !important;" id="c_printing"></pre></div>

## Decoding the byte array

To decode the byte array in C on our microcontorller, we must traverse it whilst keeping track of our position. We can do this by simply incrementing a variable that we will call `ptr`.

We still only have 2 types of data to concern ourselves with. In the case of a single byte value, such as `image_idx`, extraction is simple:

```c
static const char tile_data[102] = {
    0x06, 0x6f, 0x66, 0x66, 0x69, 0x63, 0x65, 0x01, 0x04, 0x50, 0x4f, 0x53, 0x54, 0x11, 0x2f, 0x76, 0x32, 0x2f, 0x6d, 0x65, 0x72, 0x6f, 0x73, 0x73, 0x2f, 0x6f, 0x66, 0x66, 0x69, 0x63, 0x65, 0x12, 0x7b, 0x22, 0x63, 0x6f, 0x64, 0x65, 0x22, 0x3a, 0x20, 0x22, 0x74, 0x6f, 0x67, 0x67, 0x6c, 0x65, 0x22, 0x7d, 0x04, 0x50, 0x4f, 0x53, 0x54, 0x11, 0x2f, 0x76, 0x32, 0x2f, 0x6d, 0x65, 0x72, 0x6f, 0x73, 0x73, 0x2f, 0x6f, 0x66, 0x66, 0x69, 0x63, 0x65, 0x12, 0x7b, 0x22, 0x63, 0x6f, 0x64, 0x65, 0x22, 0x3a, 0x20, 0x22, 0x73, 0x74, 0x61, 0x74, 0x75, 0x73, 0x22, 0x7d, 0x05, 0x6f, 0x6e, 0x6f, 0x66, 0x66, 0x01, 0x31, 0x01, 0x30
};
uint ptr = 7;

char image_idx = tile_data[ptr++];
```

To reconstruct a string however, we must use the string length provided in `tile_data` to determine how many bytes to `malloc` and copy:

```c
static const char tile_data[102] = {
    0x06, 0x6f, 0x66, 0x66, 0x69, 0x63, 0x65, 0x01, 0x04, 0x50, 0x4f, 0x53, 0x54, 0x11, 0x2f, 0x76, 0x32, 0x2f, 0x6d, 0x65, 0x72, 0x6f, 0x73, 0x73, 0x2f, 0x6f, 0x66, 0x66, 0x69, 0x63, 0x65, 0x12, 0x7b, 0x22, 0x63, 0x6f, 0x64, 0x65, 0x22, 0x3a, 0x20, 0x22, 0x74, 0x6f, 0x67, 0x67, 0x6c, 0x65, 0x22, 0x7d, 0x04, 0x50, 0x4f, 0x53, 0x54, 0x11, 0x2f, 0x76, 0x32, 0x2f, 0x6d, 0x65, 0x72, 0x6f, 0x73, 0x73, 0x2f, 0x6f, 0x66, 0x66, 0x69, 0x63, 0x65, 0x12, 0x7b, 0x22, 0x63, 0x6f, 0x64, 0x65, 0x22, 0x3a, 0x20, 0x22, 0x73, 0x74, 0x61, 0x74, 0x75, 0x73, 0x22, 0x7d, 0x05, 0x6f, 0x6e, 0x6f, 0x66, 0x66, 0x01, 0x31, 0x01, 0x30
};
uint ptr = 0;

uint8_t str_size = (uint8_t)tile_data[ptr++]; // First byte denotes string size
char *name = (char *)malloc(str_size * sizeof(char) + 1); // Allocate memory
strncpy(name, &tile_data[ptr], str_size);   // Copy to alloced memory
name[str_size] = '\0';  // Null terminate
ptr += str_size;
```
We will perform this same string action many times so it makes sense to refactor it into a function call:

```c
char make_str(char **dest, const char *src) {
    uint8_t str_size = (uint8_t)*src++; // First byte denotes string size
    *dest = (char *)malloc(str_size * sizeof(char) + 1); // Allocate memory
    strncpy(*dest, src, str_size);  // Copy to alloced memory
    (*dest)[str_size] = '\0';  // Null terminate
    return str_size + 1;
}

int main() {
    static const char tile_data[102] = {
        0x06, 0x6f, 0x66, 0x66, 0x69, 0x63, 0x65, 0x01, 0x04, 0x50, 0x4f, 0x53, 0x54, 0x11, 0x2f, 0x76, 0x32, 0x2f, 0x6d, 0x65, 0x72, 0x6f, 0x73, 0x73, 0x2f, 0x6f, 0x66, 0x66, 0x69, 0x63, 0x65, 0x12, 0x7b, 0x22, 0x63, 0x6f, 0x64, 0x65, 0x22, 0x3a, 0x20, 0x22, 0x74, 0x6f, 0x67, 0x67, 0x6c, 0x65, 0x22, 0x7d, 0x04, 0x50, 0x4f, 0x53, 0x54, 0x11, 0x2f, 0x76, 0x32, 0x2f, 0x6d, 0x65, 0x72, 0x6f, 0x73, 0x73, 0x2f, 0x6f, 0x66, 0x66, 0x69, 0x63, 0x65, 0x12, 0x7b, 0x22, 0x63, 0x6f, 0x64, 0x65, 0x22, 0x3a, 0x20, 0x22, 0x73, 0x74, 0x61, 0x74, 0x75, 0x73, 0x22, 0x7d, 0x05, 0x6f, 0x6e, 0x6f, 0x66, 0x66, 0x01, 0x31, 0x01, 0x30
    };
    uint ptr = 0;
    char *name;
    ptr += make_str(&name, (char *)&tile_data[ptr]);
}
```

Piecing this all together we end up with the following code that can decode our packed tile data into c structs:

```c
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "pico/stdlib.h"

typedef struct RESTFUL_REQUEST_DATA_ {
    char *method;
    char *endpoint;
    char *json_body;
    char *key;
    char *on_value;
    char *off_value;
} RESTFUL_REQUEST_DATA;

typedef struct TILE_ {
    char *name;
    char image_idx;
    RESTFUL_REQUEST_DATA *action_request;
    RESTFUL_REQUEST_DATA *status_request;
} TILE;

static const char tile_data[102] = {
    0x06, 0x6f, 0x66, 0x66, 0x69, 0x63, 0x65, 0x01, 0x04, 0x50, 0x4f, 0x53, 0x54, 0x11, 0x2f, 0x76, 0x32, 0x2f, 0x6d, 0x65, 0x72, 0x6f, 0x73, 0x73, 0x2f, 0x6f, 0x66, 0x66, 0x69, 0x63, 0x65, 0x12, 0x7b, 0x22, 0x63, 0x6f, 0x64, 0x65, 0x22, 0x3a, 0x20, 0x22, 0x74, 0x6f, 0x67, 0x67, 0x6c, 0x65, 0x22, 0x7d, 0x04, 0x50, 0x4f, 0x53, 0x54, 0x11, 0x2f, 0x76, 0x32, 0x2f, 0x6d, 0x65, 0x72, 0x6f, 0x73, 0x73, 0x2f, 0x6f, 0x66, 0x66, 0x69, 0x63, 0x65, 0x12, 0x7b, 0x22, 0x63, 0x6f, 0x64, 0x65, 0x22, 0x3a, 0x20, 0x22, 0x73, 0x74, 0x61, 0x74, 0x75, 0x73, 0x22, 0x7d, 0x05, 0x6f, 0x6e, 0x6f, 0x66, 0x66, 0x01, 0x31, 0x01, 0x30
};

char make_str(char **dest, const char *src) {
    uint8_t str_size = (uint8_t)*src++;
    *dest = (char *)malloc(str_size * sizeof(char) + 1);
    strncpy(*dest, src, str_size);
    (*dest)[str_size] = '\0';  // Null terminate
    return str_size + 1;
}

void make_tile() {
    uint ptr = 0;

    TILE *tile = (TILE *)malloc(sizeof(TILE));

    // Name
    ptr += make_str(&tile->name, (char *)&tile_data[ptr]);
    // Image idx
    tile->image_idx = tile_data[ptr++];

    // Action Request
    RESTFUL_REQUEST_DATA *action_request = (RESTFUL_REQUEST_DATA *)malloc(sizeof(RESTFUL_REQUEST_DATA));
    tile->action_request = action_request;

    ptr += make_str(&action_request->method, (char *)&tile_data[ptr]);
    ptr += make_str(&action_request->endpoint, (char *)&tile_data[ptr]);
    ptr += make_str(&action_request->json_body, (char *)&tile_data[ptr]);
    action_request->key = NULL;

    // Status Request
    RESTFUL_REQUEST_DATA *status_request = (RESTFUL_REQUEST_DATA *)malloc(sizeof(RESTFUL_REQUEST_DATA));
    tile->status_request = status_request;

    ptr += make_str(&status_request->method, (char *)&tile_data[ptr]);
    ptr += make_str(&status_request->endpoint, (char *)&tile_data[ptr]);
    ptr += make_str(&status_request->json_body, (char *)&tile_data[ptr]);
    ptr += make_str(&status_request->key, (char *)&tile_data[ptr]);
    ptr += make_str(&status_request->on_value, (char *)&tile_data[ptr]);
    ptr += make_str(&status_request->off_value, (char *)&tile_data[ptr]);

    printf("Name: %s\nImage Index: %d\nAction Request:\n    Method: %s\n    Endpoint: %s\n    JSON Body: %s\nStatus Request:\n    Method: %s\n    Endpoint: %s\n    JSON Body: %s\n    Key: %s\n    On Value: %s\n    Off Value: %s\n",
        tile->name,
        tile->image_idx,
        tile->action_request->method, tile->action_request->endpoint, tile->action_request->json_body,
        tile->status_request->method, tile->status_request->endpoint, tile->status_request->json_body, tile->status_request->key, tile->status_request->on_value, tile->status_request->off_value
    );
}

int main() {
    stdio_init_all();
    make_tile();
    return 0;
}
```
<a style="margin-top:-20px;" target="_blank" href="https://wokwi.com/projects/398438177444631553">
    <img src="wokwi_badge.svg"></img>
</a>

# Get the preprocessor to do it

We have now managed to convert a JSON file into a byte array, hardcode it and then decode it. We can go further however. If we are using a build tool such as CMake. We can simply instruct it to run the python script on our behalf:

```cmake
set(JSON_FILEPATH "${PROJECT_SOURCE_DIR}/config/tiles.json" CACHE STRING "Location of tiles json")

execute_process(COMMAND "${PROJECT_SOURCE_DIR}/tools/json_to_c_array.py" "-f" "${JSON_FILEPATH}" OUTPUT_VARIABLE "TILE_DATA")

target_compile_definitions(badger PRIVATE 
    TILE_DATA=${TILE_DATA}
)
```
<a style="margin-top:-20px;" target="_blank" href="https://github.com/kennedn/restful-badger/blob/main/src/CMakeLists.txt#L22-L40">
    <img src="view_source_badge.svg"></img>
</a>

This symbol can then be referenced in our C code and replaced with our bytes by the preprocessor at build time:

```c
static const char tile_data[] = {
    TILE_DATA
};
```
<a style="margin-top:-20px;" target="_blank" href="https://github.com/kennedn/restful-badger/blob/main/src/modules/tiles.c#L18-L19">
    <img src="view_source_badge.svg"></img>
</a>


The techniques discussed in this blog post were utilized and expanded upon to create [restful-badger](https://github.com/kennedn/restful-badger). Hopefully, someone will find them useful for their own project. Happy coding!