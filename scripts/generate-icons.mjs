import { copyFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const appMaster = join(root, 'assets/icon-source/app-icon.svg')
const trayMaster = join(root, 'assets/icon-source/tray-icon.svg')
const iconsDir = join(root, 'src-tauri/icons')
const previewPath = join(root, 'assets/grove.png')

const expectedDimensions = new Map([
  ['32x32.png', [32, 32]],
  ['64x64.png', [64, 64]],
  ['128x128.png', [128, 128]],
  ['128x128@2x.png', [256, 256]],
  ['icon.png', [512, 512]],
  ['tray-icon.png', [22, 22]],
  ['tray-icon@2x.png', [44, 44]],
])

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: 'utf8',
    stdio: options.capture ? 'pipe' : 'inherit',
  })

  if (result.status !== 0) {
    const details = [result.stdout, result.stderr].filter(Boolean).join('\n')
    throw new Error(`${command} ${args.join(' ')} failed${details ? `:\n${details}` : ''}`)
  }

  return result.stdout?.trim() ?? ''
}

function requireFile(path) {
  if (!existsSync(path)) {
    throw new Error(`Missing required icon asset: ${path}`)
  }
}

function dimensions(path) {
  const output = run('magick', ['identify', '-format', '%w %h', path], { capture: true })
  return output.split(' ').map(Number)
}

function verifyTrayPurity(path) {
  const channelMaxima = run(
    'magick',
    [path, '-channel', 'RGB', '-separate', '-format', '%[max] ', 'info:'],
    { capture: true },
  ).split(/\s+/).filter(Boolean).map(Number)

  if (channelMaxima.length !== 3 || channelMaxima.some((maximum) => maximum !== 0)) {
    throw new Error(`${path} is not a pure black-on-transparency template image`)
  }
}

function verifyTransparency(path) {
  const corner = run('magick', [path, '-format', '%[pixel:p{0,0}]', 'info:'], { capture: true })
  const alphaMaximum = Number(
    run('magick', [path, '-format', '%[fx:maxima.a]', 'info:'], { capture: true }),
  )

  if (!corner.endsWith(',0)')) {
    throw new Error(`${path} does not have a transparent top-left corner`)
  }
  if (alphaMaximum !== 1) {
    throw new Error(`${path} has no fully opaque visible pixels`)
  }
}

function verify() {
  run('xmllint', ['--noout', appMaster, trayMaster])

  for (const [filename, expected] of expectedDimensions) {
    const path = join(iconsDir, filename)
    requireFile(path)
    const actual = dimensions(path)
    if (actual[0] !== expected[0] || actual[1] !== expected[1]) {
      throw new Error(`${filename} is ${actual.join('x')}; expected ${expected.join('x')}`)
    }
  }

  requireFile(previewPath)
  const previewDimensions = dimensions(previewPath)
  if (previewDimensions[0] !== 1024 || previewDimensions[1] !== 1024) {
    throw new Error(`assets/grove.png is ${previewDimensions.join('x')}; expected 1024x1024`)
  }

  verifyTransparency(previewPath)
  verifyTransparency(join(iconsDir, 'icon.png'))
  verifyTransparency(join(iconsDir, 'tray-icon.png'))
  verifyTransparency(join(iconsDir, 'tray-icon@2x.png'))
  verifyTrayPurity(join(iconsDir, 'tray-icon.png'))
  verifyTrayPurity(join(iconsDir, 'tray-icon@2x.png'))
  console.log('Icon assets verified.')
}

function generate() {
  requireFile(appMaster)
  requireFile(trayMaster)

  const temp = mkdtempSync(join(tmpdir(), 'grove-icons-'))
  try {
    run('npx', ['tauri', 'icon', appMaster, '-o', iconsDir])

    const previewDir = join(temp, 'preview')
    const tray1xDir = join(temp, 'tray-1x')
    const tray2xDir = join(temp, 'tray-2x')

    run('npx', ['tauri', 'icon', appMaster, '-o', previewDir, '--png', '1024'])
    run('npx', ['tauri', 'icon', trayMaster, '-o', tray1xDir, '--png', '22'])
    run('npx', ['tauri', 'icon', trayMaster, '-o', tray2xDir, '--png', '44'])

    copyFileSync(join(previewDir, '1024x1024.png'), previewPath)
    copyFileSync(join(tray1xDir, '22x22.png'), join(iconsDir, 'tray-icon.png'))
    copyFileSync(join(tray2xDir, '44x44.png'), join(iconsDir, 'tray-icon@2x.png'))
    copyFileSync(trayMaster, join(iconsDir, 'tray-icon.svg'))
  } finally {
    rmSync(temp, { recursive: true, force: true })
  }

  verify()
}

const command = process.argv[2] ?? 'generate'
if (command === 'generate') {
  generate()
} else if (command === 'verify') {
  verify()
} else {
  throw new Error(`Unknown command: ${command}`)
}
