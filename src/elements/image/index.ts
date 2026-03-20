// Image Element Plugin
//
// Renders user-uploaded images (camera/gallery). Created via palette menu.
// Importing this module automatically registers the plugin and palette entries.

import type { ImageElement } from './types';
import { createImageElement } from './types';
import type { ElementPlugin, HandleDescriptor, HandleDragPhase } from '../registry/ElementPlugin';
import { registerPlugin } from '../registry/ElementRegistry';
import { render, getBounds } from './renderer';
import { registerPaletteEntry } from '../../palette/PaletteRegistry';
import { CameraIcon, GalleryIcon } from './icon';
import { pickImage } from './imageLoader';
import type { Offset } from '../../types/primitives';

const HANDLE_SIZE = 8;

const imagePlugin: ElementPlugin<ImageElement> = {
  elementType: 'image',
  name: 'Image',

  render,
  getBounds,

  getHandles(element: ImageElement): HandleDescriptor[] {
    const { displayWidth, displayHeight, transform } = element;
    const tx = transform.values[6];
    const ty = transform.values[7];
    return [
      {
        id: 'topLeft',
        position: { x: tx, y: ty },
        appearance: { shape: 'square', size: HANDLE_SIZE, fillColor: '#4A90D9', strokeColor: '#fff' },
        cursor: 'nwse-resize',
      },
      {
        id: 'topRight',
        position: { x: tx + displayWidth, y: ty },
        appearance: { shape: 'square', size: HANDLE_SIZE, fillColor: '#4A90D9', strokeColor: '#fff' },
        cursor: 'nesw-resize',
      },
      {
        id: 'bottomLeft',
        position: { x: tx, y: ty + displayHeight },
        appearance: { shape: 'square', size: HANDLE_SIZE, fillColor: '#4A90D9', strokeColor: '#fff' },
        cursor: 'nesw-resize',
      },
      {
        id: 'bottomRight',
        position: { x: tx + displayWidth, y: ty + displayHeight },
        appearance: { shape: 'square', size: HANDLE_SIZE, fillColor: '#4A90D9', strokeColor: '#fff' },
        cursor: 'nwse-resize',
      },
    ];
  },

  onHandleDrag(
    element: ImageElement,
    handleId: string,
    phase: HandleDragPhase,
    canvasPoint: Offset
  ): ImageElement {
    if (phase === 'start') return element;

    const tx = element.transform.values[6];
    const ty = element.transform.values[7];

    let newWidth: number;
    let newHeight: number;
    let newTx = tx;
    let newTy = ty;

    switch (handleId) {
      case 'bottomRight': {
        newWidth = Math.max(50, canvasPoint.x - tx);
        newHeight = Math.max(50, canvasPoint.y - ty);
        break;
      }
      case 'bottomLeft': {
        newWidth = Math.max(50, (tx + element.displayWidth) - canvasPoint.x);
        newHeight = Math.max(50, canvasPoint.y - ty);
        newTx = tx + element.displayWidth - newWidth;
        break;
      }
      case 'topRight': {
        newWidth = Math.max(50, canvasPoint.x - tx);
        newHeight = Math.max(50, (ty + element.displayHeight) - canvasPoint.y);
        newTy = ty + element.displayHeight - newHeight;
        break;
      }
      case 'topLeft': {
        newWidth = Math.max(50, (tx + element.displayWidth) - canvasPoint.x);
        newHeight = Math.max(50, (ty + element.displayHeight) - canvasPoint.y);
        newTx = tx + element.displayWidth - newWidth;
        newTy = ty + element.displayHeight - newHeight;
        break;
      }
      default:
        return element;
    }

    const values = [...element.transform.values] as [number, number, number, number, number, number, number, number, number];
    values[6] = newTx;
    values[7] = newTy;

    return {
      ...element,
      transform: { values },
      displayWidth: newWidth,
      displayHeight: newHeight,
    };
  },
};

registerPlugin(imagePlugin);

/* Register palette entries for Camera and Gallery */
registerPaletteEntry({
  id: 'camera',
  label: 'Camera',
  Icon: CameraIcon,
  category: 'image',
  onSelect: async (bounds, consumeStrokes) => {
    const result = await pickImage('camera');
    if (!result) return null;

    consumeStrokes();
    const rectWidth = bounds.right - bounds.left;
    const rectHeight = bounds.bottom - bounds.top;
    return createImageElement(bounds, result.dataUrl, result.width, result.height, rectWidth, rectHeight);
  },
});

registerPaletteEntry({
  id: 'gallery',
  label: 'Gallery',
  Icon: GalleryIcon,
  category: 'image',
  onSelect: async (bounds, consumeStrokes) => {
    const result = await pickImage('gallery');
    if (!result) return null;

    consumeStrokes();
    const rectWidth = bounds.right - bounds.left;
    const rectHeight = bounds.bottom - bounds.top;
    return createImageElement(bounds, result.dataUrl, result.width, result.height, rectWidth, rectHeight);
  },
});

export { imagePlugin };
