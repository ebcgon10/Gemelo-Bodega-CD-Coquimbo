# Prueba de interfaz: archivo cargado por el usuario pasa a ser la fuente; texto del CSV no se ejecuta.
import asyncio, sys
from playwright.async_api import async_playwright
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
        pg = await b.new_page(viewport={'width':1400,'height':850})
        await pg.goto('http://localhost:8765/index.html'); await pg.wait_for_timeout(2000)
        await pg.set_input_files('#file', '/tmp/ui/cuad_xss.csv'); await pg.wait_for_timeout(500)
        main_chip = await pg.inner_text('#src .chip.on')
        el = await pg.query_selector('rect[data-pos="05-01-02"]'); bb = await el.bounding_box()
        await pg.mouse.click(bb['x']+bb['width']/2, bb['y']+bb['height']/2); await pg.wait_for_timeout(500)
        x = await pg.evaluate('window.__x')
        await b.close()
        ok = main_chip.startswith('● Cuadratura') and x is None
        print('main:', main_chip, '| xss:', x, '| PASS' if ok else '| FAIL'); sys.exit(0 if ok else 1)
asyncio.run(main())
