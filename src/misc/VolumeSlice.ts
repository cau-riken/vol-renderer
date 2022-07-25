//From https://github.com/mrdoob/three.js/blob/dev/examples/jsm/misc/VolumeSlice.js

import {
	ClampToEdgeWrapping,
	DoubleSide,
	LinearFilter,
	Mesh,
	MeshBasicMaterial,
	PlaneGeometry,
	Texture
} from 'three';

import { AxisIndex, Volume } from './Volume';


/**
 * slice of a volume data
 * @class
 * @param   {Volume} volume    The associated volume
 * @param   {number}       [index=0] The initial index of the slice
 * @param   {AxisIndex}   [AxisIndex.Z]
 * @param   {shallow}   [false] set to true to create a shallow slice that doesn't own geometry/canvas, and is just used to access its image data  
 * @see Volume
 */
class VolumeSlice {

	constructor(volume: Volume, index: number, axis: AxisIndex, shallow?: boolean) {
		this.volume = volume;
		this.index = index;
		this.axis = axis;
		this.shallow = shallow === true;

		Object.defineProperty(this, 'index', {
			get: () => {

				return index;

			},
			set: (value: number) => {

				index = value;
				this.geometryNeedsUpdate = true;
				return index;

			}
		});

		if (!shallow) {
			this.canvas = document.createElement('canvas');
		}

		this.updateGeometry();

		if (!shallow) {
			const canvasMap = new Texture(this.canvas);
			canvasMap.minFilter = LinearFilter;
			canvasMap.wrapS = canvasMap.wrapT = ClampToEdgeWrapping;
			const material = new MeshBasicMaterial({ map: canvasMap, side: DoubleSide, });
			//	, transparent: true, opacity: 0.5, depthWrite: false, depthTest: false, alphaTest: 0.5  } );

			this.mesh = new Mesh(this.geometry, material);
			this.mesh.matrixAutoUpdate = false;
		}
		this.geometryNeedsUpdate = true;

		this.repaint();

	};

	/**
	 * @member {Volume} volume The associated volume
	 */
	volume: Volume;

	/**
	 * @member {Number} index The index of the slice, if changed, will automatically call updateGeometry at the next repaint
	 */
	index: number;

	/**
	 * @member {AxisIndex} axis The normal axis
	 */
	axis: AxisIndex;

	/**
	 * @member {boolean} shallow set to true for slice without geometry/canvas (for overlay Volume)
	 */
	shallow: boolean;

	/**
	 * @member {HTMLCanvasElement} canvas The final (offscreen) canvas used for the texture	
	 */
	private canvas;
	/**
	 * @member {HTMLCanvasElement} canvasBuffers The (offscreen) canvas used for intermediary to painting of the data (filtering, labels overlay)
	 */
	private canvasBuffers: HTMLCanvasElement[] = [];

	/**
	 * @member {Mesh} mesh The mesh ready to get used in the scene
	 */
	mesh;

	/**
	 * @member {Boolean} geometryNeedsUpdate If set to true, updateGeometry will be triggered at the next repaint
	 */
	private geometryNeedsUpdate;

	/**
	 * @member {Number} iLength Width of slice in the original coordinate system, corresponds to the width of the buffer canvas
	 */
	private iLength: number = 0;
	/**
	 * @member {Number} jLength Height of slice in the original coordinate system, corresponds to the height of the buffer canvas
	 */
	private jLength: number = 0;

	/**
	 * @member {Function} sliceAccess Function that allow the slice to access right data
	 * @see Volume.extractPerpendicularPlane
	 * @param {Number} i The first coordinate
	 * @param {Number} j The second coordinate
	 * @returns {Number} the index corresponding to the voxel in volume.data of the given position in the slice
	 */
	private sliceAccess: ((i: number, j: number) => number) = () => 0;

	private geometry: THREE.BufferGeometry | undefined;

	/**
	 * @member {Function} repaint Refresh the texture and the geometry if geometryNeedsUpdate is set to true
	 * @memberof VolumeSlice
	 */
	repaint() {

		if (this.geometryNeedsUpdate) {
			this.updateGeometry();
		}
		if (this.shallow) {
			return;
		}

		const iLength = this.iLength,
			jLength = this.jLength,
			volume = this.volume;

		//final canvas where all filtered image will be drawn
		const ctx = this.canvas!.getContext('2d');
		if (ctx == null) {
			console.error("Could not create drawing context for final canvas!");
			return;
		}

		//clear destination image 
		ctx.clearRect(0, 0, iLength, jLength);

		//composition of main volume image with overlay image(s)
		let volMixRatio: number;
		let overlayMixRatio: number;
		if (volume.overlays.length > 0) {
			volMixRatio = Math.max(Math.min(volume.mixRatio, 1), 0);
			overlayMixRatio = (1 - volMixRatio) / volume.overlays.length;
		} else {
			volMixRatio = 1;
			overlayMixRatio = 0;
		}
		//1rst layer is main volume
		const layers = [{ layerVol: volume, pixelAccess: this.sliceAccess, mixRatio: volMixRatio }];
		//one more layer for each overlay volumes 
		volume.overlays.forEach(overlayVol => {
			const overlaySlice = overlayVol.getSlice(this.axis);
			if (overlaySlice) {
				overlaySlice.index = this.index;
				overlaySlice.repaint();
				layers.push({ layerVol: overlayVol, pixelAccess: overlaySlice.sliceAccess, mixRatio: overlayMixRatio });
			}
		});

		//combine images
		layers.forEach(({ layerVol, pixelAccess, mixRatio }, layerIndex) => {

			let canvasBuffer = this.canvasBuffers[layerIndex];
			if (typeof canvasBuffer == 'undefined') {
				//use 1 canvas buffer per layer (lazily created)
				canvasBuffer = document.createElement('canvas');
				canvasBuffer!.width = this.iLength;
				canvasBuffer!.height = this.jLength;
				this.canvasBuffers[layerIndex] = canvasBuffer;
			}

			const ctxBuffer = canvasBuffer?.getContext('2d');

			if (ctxBuffer == null) {
				console.error("Could not create drawing context!");
			} else {
				// get empty ImageData object to draw the layer's updated image
				const imgData = ctxBuffer.createImageData(iLength, jLength);

				const destData = imgData.data;

				const srcData = layerVol.data;
				const colorTable = layerVol.lookupTable;

				//filter values to apply to the image 
				const windowLow = layerVol.windowLow;
				const windowHigh = layerVol.windowHigh;

				const layerAlpha = 0xff * mixRatio;

				// manipulate some pixel elements
				let pixelCount = 0;

				for (let j = 0; j < jLength; j++) {

					for (let i = 0; i < iLength; i++) {

						let value = srcData[pixelAccess(i, j)];
						let r, g, b;
						let alpha = layerAlpha;

						if (colorTable) {
							//if a color table is supplied, voxel value is the index at which the color defined in the lut
							const colorIndex = Math.trunc(value);
							const color = colorTable[colorIndex];
							if (color) {
								[r, g, b,] = color.color;
							} else {
								r = g = b = 0;
								alpha = 0;
							}
						} else {
							//apply window level and convert to 8bits value
							value = Math.floor(255 * (value - windowLow) / (windowHigh - windowLow));
							value = value > 255 ? 255 : (value < 0 ? 0 : value | 0);
							r = g = b = value;
						}

						destData[4 * pixelCount] = r;
						destData[4 * pixelCount + 1] = g;
						destData[4 * pixelCount + 2] = b;
						destData[4 * pixelCount + 3] = alpha;
						pixelCount++;
					}
				}

				//update intermediary canvas with filtered image
				ctxBuffer.putImageData(imgData, 0, 0);
			}
		});

		//draw on final buffer (specifically setting blending method)
		const compositeOpbackup = ctx.globalCompositeOperation;
		ctx.globalCompositeOperation = 'screen';
		this.canvasBuffers.forEach(canvasBuffer =>
			ctx.drawImage(canvasBuffer, 0, 0, iLength, jLength, 0, 0, iLength, jLength)
		)
		//restore default composition value
		ctx.globalCompositeOperation = compositeOpbackup;

		const colorMap = (this.mesh?.material as THREE.MeshBasicMaterial).map;
		if (colorMap) {
			colorMap.needsUpdate = true;
		}

	};

	/**
	 * @member {Function} Refresh the geometry according to axis and index
	 * @see Volume.extractPerpendicularPlane
	 * @memberof VolumeSlice
	 */
	private updateGeometry() {

		const extracted = this.volume.extractPerpendicularPlane(this.axis, this.index, this.shallow ? this.volume.mainVolumeMatrix : undefined);
		this.sliceAccess = extracted.sliceAccess;
		this.jLength = extracted.jLength;
		this.iLength = extracted.iLength;

		//canvas dimensions are same as source image (IJK space)
		if (!this.shallow) {
			this.canvas!.width = this.iLength;
			this.canvas!.height = this.jLength;

			if (this.geometry) this.geometry.dispose(); // dispose existing geometry

			//plane holding the slice has dimensions in RAS space
			this.geometry = new PlaneGeometry(extracted.planeWidth, extracted.planeHeight);

			if (this.mesh) {

				this.mesh.geometry = this.geometry;
				//reset mesh matrix
				this.mesh.matrix.identity();
				this.mesh.applyMatrix4(extracted.matrix);

			}
		}
		this.geometryNeedsUpdate = false;

	};

	getVoxelIndexAtUV(uv: THREE.Vector2) {
		const [u, v] = uv.toArray();
		const i = Math.round(u * this.iLength);
		const j = Math.round((1 - v) * this.jLength);
		return this.volume.data[this.sliceAccess(i, j)];
	};

	/**
	 * @member {Function} Dispose allocated geometries, textures, materials
	 * @memberof VolumeSlice
	 */
	dispose() {
		//because Volume & VolumeSlice reference each other, the circular references loop needs to be broken...
		this.volume = undefined;
		if (this.geometry) this.geometry.dispose();
		if (this.mesh) {
			//this.mesh.material.map().dispose();
			this.mesh.material.dispose();
		}
	};

};

export { VolumeSlice };