//Derived from https://github.com/mrdoob/three.js/blob/dev/examples/jsm/misc/Volume.js

import {
	Matrix4,
	Vector3
} from 'three';
import { VolumeSlice } from './VolumeSlice';

export type IndexedRegionColorEntry = {
	index: number,
	abbrev: string,
	hemisph: string,
	color: [number, number, number, number]
};

export const parseColorLUT = (text: string) => {
	const re = /([0-9]+)\s+([R|L]H):_.*_\(([^)]*)\)\s+([0-9]+)\s+([0-9]+)\s+([0-9]+)\s+([0-9]+).*/;

	let maxIndex = 0;
	const entries = text
		.split('\n')
		.map(l => re.exec(l))
		.filter(parts => parts != null)
		.map(parts => {
			const [, colorNum, hemisph, abbrev, r, g, b, a] = parts;
			const index = parseInt(colorNum);
			maxIndex = Math.max(maxIndex, index);
			return { index, abbrev, hemisph, color: [parseInt(r), parseInt(g), parseInt(b), parseInt(a)] } as IndexedRegionColorEntry;
		});
	const lut = new Array<IndexedRegionColorEntry>(maxIndex + 1);
	entries.forEach(e => lut[e.index] = e);
	return lut;
};


export enum AxisIndex {
	X = 0,
	Y = 1,
	Z = 2,
}

/**
 * This class had been written to handle the output of the NIfTI loader.
 * @class
 */
class Volume {

	/**
	  * @member {number} xLength Width of the volume in the IJK coordinate system
	  */
	xLength: number = 1;

	/**
	 * @member {number} yLength Height of the volume in the IJK coordinate system
	 */
	yLength: number = 1;

	/**
	 * @member {number} zLength Depth of the volume in the IJK coordinate system
	 */
	zLength: number = 1;

	/**
	 * @member {TypedArray} data Data of the volume
	 */
	data: Uint8Array | Int8Array
		| Int16Array | Uint16Array
		| Int32Array | Uint32Array
		| Float32Array | Float64Array = new Uint8Array();

	datatype: Uint8ArrayConstructor | Int8ArrayConstructor
		| Int16ArrayConstructor | Uint16ArrayConstructor
		| Int32ArrayConstructor | Uint32ArrayConstructor
		| Float32ArrayConstructor | Float64ArrayConstructor
		| undefined;

	/**
	 * @member {Array}  spacing Spacing to apply to the volume from IJK to RAS coordinate system
	 */
	spacing = [1, 1, 1];

	/**
	 * @member {Array}  offset Offset of the volume in the RAS coordinate system
	 */
	offset = [0, 0, 0];

	/**
	 * @member {Matrix4} matrix The IJK to RAS matrix
	 */
	matrix = new Matrix4();

	/**
	 * @member {Matrix4} inverseMatrix The RAS to IJK matrix
	 */
	inverseMatrix = new Matrix4();

	windowLow: number = - Infinity;
	windowHigh: number = + Infinity;

	/**
	 * @member {number} min minimum voxel value of this volume
	 */
	min: number = 0;

	/**
	 * @member {number} min maximum voxel value of this volume
	 */
	max: number = 0;

	/**
	 * @member {Array} sliceList The list of all the slices associated to this volume
	 */
	sliceList: [VolumeSlice | undefined, VolumeSlice | undefined, VolumeSlice | undefined] = [undefined, undefined, undefined];

	/**
	 * @member {Array} RASDimensions This array holds the dimensions of the volume in the RAS space
	 */
	RASDimensions: [number, number, number] = [0, 0, 0];

	/**
	 * @member {Array} overlays This array holds optional overlay Volumes
	 */
	overlays: Volume[] = [];

	/**
	 * @member {number} mixRatio visibility ratio of the main Volume image when compositing with overlays' image(s)
	 */
	mixRatio: number = 1;

	/**
	 * @member {IndexedRegionColorEntry[]} lookupTable optional color/region lookup table if volume contains indexed colors images.
	 */
	lookupTable?: IndexedRegionColorEntry[];

	/**
	 * @member {Matrix4} matrix The IJK to RAS matrix of the main Volume this volume is overlayed on
	 */
	mainVolumeMatrix?: Matrix4;

	/**
	 * @member {Function} 
	 * @param {AxisIndex}            axis  the normal axis to the slice	
	 * */
	getSlice(axis: AxisIndex) {

		return this.sliceList[axis];

	}

	/**
	 * @member {Function} getData Shortcut for data[access(i,j,k)]
	 * @memberof Volume
	 * @param {number} i    First coordinate
	 * @param {number} j    Second coordinate
	 * @param {number} k    Third coordinate
	 * @returns {number}  value in the data array
	 */
	getData(i: number, j: number, k: number) {

		return this.data[k * this.xLength * this.yLength + j * this.xLength + i];

	};

	/**
	 * @member {Function} access compute the index in the data array corresponding to the given coordinates in IJK system
	 * @memberof Volume
	 * @param {number} i    First coordinate
	 * @param {number} j    Second coordinate
	 * @param {number} k    Third coordinate
	 * @returns {number}  index
	 */
	access(i: number, j: number, k: number) {

		return k * this.xLength * this.yLength + j * this.xLength + i;
	};

	/**
	 * @member {Function} reverseAccess Retrieve the IJK coordinates of the voxel corresponding of the given index in the data
	 * @memberof Volume
	 * @param {number} index index of the voxel
	 * @returns {Array}  [x,y,z]
	 */
	reverseAccess(index: number) {

		const z = Math.floor(index / (this.yLength * this.xLength));
		const y = Math.floor((index - z * this.yLength * this.xLength) / this.xLength);
		const x = index - z * this.yLength * this.xLength - y * this.xLength;
		return [x, y, z];
	};

	/**
	 * @member {Function} extractPerpendicularPlane Compute the orientation of the slice and returns all the information relative to the geometry such as sliceAccess, the plane matrix (orientation and position in RAS coordinate) and the dimensions of the plane in both coordinate system.
	 * @memberof Volume
	 * @param {AxisIndex}            axis  the normal axis to the slice
	 * @param {number}            sliceRASIndex RAS index of the slice 
	 * @param {Matrix4}            mainVolMatrix matrix of the main volume this volume is overlayed on (undefined if this volume is not used as an overlay).
	 * @returns {Object} an object containing all the useful information on the geometry of the slice
	 */
	extractPerpendicularPlane(axis: AxisIndex, sliceRASIndex: number, mainVolMatrix?: Matrix4) {

		//Note: slice RAS indexes are always increasing from L to R, P to A, I to S.
		//      (as opposed to IJK index which can increase in any direction depending on each NIfTI specifics)

		let volume = this;

		//volume IJK dimensions (number of slices)
		const dimensions = new Vector3(this.xLength, this.yLength, this.zLength);

		// slice image dimensions (in voxels)
		let iLength,
			jLength;

		//matrix applied to the geometry holding slice image to translate/rotate the slice at its correct location in RAS space
		let planeMatrix = new Matrix4();

		//plane dimension in RAS space (in mm)
		let planeWidth,
			planeHeight;

		//spacings of slices, along normal axis, and along i & j
		let normalSpacing,
			firstSpacing,
			secondSpacing;

		//position of the slice on its  axis (in RAS space)
		let positionOffset;

		//function that compute the index (in the volume single dimension data array) of the i,j voxel of this slice 
		let ij2PixelAccess: (i: number, j: number) => number;

		//with NRRD format, axes order is variable (unlike with NIfTI where it is always x, y, z), hence it need to be translated
		const axisInIJK = new Vector3();

		//normalized direction vector along i & j
		const firstDirection = new Vector3(),
			secondDirection = new Vector3();

		const rotationMatrix = volume.matrix;
		planeMatrix.extractRotation(rotationMatrix);

		//Note that matrix of overlay volume might be different from the main volume one, 
		//but overlay images are draw on same geometry of the main volume slice (which is transformed by main volume matrix)
		//Hence slice indexes must be adjusted to restore proper image and cancel effect of the transform
		const compMat = typeof mainVolMatrix !== 'undefined'
			?
			new Matrix4().extractRotation(mainVolMatrix).invert().multiply(planeMatrix)
			:
			new Matrix4()
			;

		//console.log('CompMat', typeof mainVolMatrix !== 'undefined' ? '(ovl)' : ' ',			axis, '.', planeMatrix.toArray(), '=', compMat.toArray());
		//console.log([new Vector3(1,0,0), new Vector3(0,1,0), new Vector3(0,0,1), ].map(v => v.applyMatrix4(compMat).toArray()));

		//indicator set to true when ijk axis is reverse compared to RAS axis
		let reverseX: boolean, reverseY: boolean, reverseZ: boolean;

		switch (axis) {

			case AxisIndex.X:
				//axisInIJK.set( 1, 0, 0 );
				//notice reversed direction for i & j 
				firstDirection.set(0, 0, - 1);
				secondDirection.set(0, - 1, 0);
				firstSpacing = this.spacing[AxisIndex.Z];
				secondSpacing = this.spacing[AxisIndex.Y];

				[reverseX, reverseY, reverseZ] = new Vector3(1, -1, -1).applyMatrix4(compMat).toArray().map(c => c < 0);

				//console.log('X reverse', [reverseX, reverseY, reverseZ]);

				ij2PixelAccess = (i, j) => volume.access(
					reverseX ? (volume.xLength - 1 - sliceRASIndex) : sliceRASIndex,
					reverseY ? (volume.yLength - 1 - j) : j,
					reverseZ ? (volume.zLength - 1 - i) : i
				);

				/*
				ij2PixelAccess = 
				overlayMatrix
				?
				//for 172warped
				(i, j) =>  volume.access( sliceRASIndex, j,  (volume.zLength - 1 - i) )
				:
				//normal case
				(i, j) =>  volume.access( sliceRASIndex, (volume.yLength - 1 - j),  (volume.zLength - 1 - i) );
					*/

				//rotate so the plane is orthogonal to X Axis
				planeMatrix.multiply((new Matrix4()).makeRotationY(Math.PI / 2));

				normalSpacing = this.spacing[AxisIndex.X];
				//middle slice will be located at the origin 
				positionOffset = (volume.RASDimensions[0] - normalSpacing) / 2;
				planeMatrix.setPosition(new Vector3(sliceRASIndex * normalSpacing - positionOffset, 0, 0));
				break;

			case AxisIndex.Y:
				axisInIJK.set(0, 1, 0);
				firstDirection.set(1, 0, 0);
				secondDirection.set(0, 0, 1);
				firstSpacing = this.spacing[AxisIndex.X];
				secondSpacing = this.spacing[AxisIndex.Z];

				reverseY = 0 >= new Vector3(1, 1, 1).applyMatrix4(rotationMatrix).getComponent(1);

				ij2PixelAccess = (i, j) => volume.access(
					i,
					reverseY ? (volume.yLength - 1 - sliceRASIndex) : sliceRASIndex,
					j
				);

				//rotate so the plane is orthogonal to Y Axis
				planeMatrix.multiply((new Matrix4()).makeRotationX(- Math.PI / 2));

				normalSpacing = this.spacing[AxisIndex.Y];
				//middle slice will be located at the origin 
				positionOffset = (volume.RASDimensions[1] - normalSpacing) / 2;
				planeMatrix.setPosition(new Vector3(0, sliceRASIndex * normalSpacing - positionOffset, 0));
				break;

			case AxisIndex.Z:
			default:
				//axisInIJK.set( 0, 0, 1 );
				firstDirection.set(1, 0, 0);
				//notice reversed direction for j 
				secondDirection.set(0, - 1, 0);
				firstSpacing = this.spacing[AxisIndex.X];
				secondSpacing = this.spacing[AxisIndex.Y];

				[reverseX, reverseY, reverseZ] = new Vector3(1, -1, 1).applyMatrix4(compMat).toArray().map(c => c < 0);
				//console.log('Z reverse', [reverseX, reverseY, reverseZ]);

				ij2PixelAccess = (i, j) => volume.access(
					reverseX ? (volume.xLength - 1 - i) : i,
					reverseY ? (volume.yLength - 1 - j) : j,
					reverseZ ? (volume.zLength - 1 - sliceRASIndex) : sliceRASIndex
				);

				/*
				ij2PixelAccess = 
				overlayMatrix
				?
				//for 172warped
				(i, j) =>  volume.access( (volume.xLength - 1 - i), j, sliceRASIndex )
				:
				//nornmal case
				 (i, j) =>  volume.access( i, (volume.yLength - 1 - j), sliceRASIndex );
				*/

				//Note: by default, newly created plane is already orthogonal to Z Axis

				normalSpacing = this.spacing[AxisIndex.Z];
				//middle slice will be located at the origin 
				positionOffset = (volume.RASDimensions[2] - normalSpacing) / 2;
				//
				planeMatrix.setPosition(new Vector3(0, 0, sliceRASIndex * normalSpacing - positionOffset));

				break;

		}

		firstDirection.applyMatrix4(volume.inverseMatrix).normalize();
		secondDirection.applyMatrix4(volume.inverseMatrix).normalize();
		iLength = Math.floor(Math.abs(firstDirection.dot(dimensions)));
		jLength = Math.floor(Math.abs(secondDirection.dot(dimensions)));

		//plane dimension in RAS space
		planeWidth = Math.abs(iLength * firstSpacing);
		planeHeight = Math.abs(jLength * secondSpacing);

		return {
			// slice of the canvas to draw slice image
			iLength: iLength,
			jLength: jLength,

			// function to retrieve the absolute index of a voxel from its i,j coords in this slice 
			sliceAccess: ij2PixelAccess,

			// matrix to apply to the geometry holding slice image to locate it correctly in RAS space 
			matrix: planeMatrix,

			// size of the plane geometry holding the slice (size in RAS space)
			planeWidth: planeWidth,
			planeHeight: planeHeight
		};

	};

	/**
	 * @member {Function} extractSlice Returns a slice corresponding to the given axis and index
	 *                        The coordinate are given in the Right Anterior Superior coordinate format
	 * @memberof Volume
	 * @param {AxisIndex}            axis  the normal axis to the slice
	 * @param {number}            index the index of the slice
	 * @returns {VolumeSlice} the extracted slice
	 */
	extractSlice(axis: AxisIndex, index: number, shallow?: boolean) {

		const slice = new VolumeSlice(this, index, axis, shallow);
		this.sliceList[axis] = slice;
		return slice;

	};

	prepareSlices(mainVolume?: Volume) {
		const shallow = typeof mainVolume != 'undefined';
		if (mainVolume) {
			this.mainVolumeMatrix = mainVolume.matrix.clone();
		}

		const initSliceIndexes = [Math.floor(this.xLength / 2), Math.floor(this.yLength / 2), Math.floor(this.zLength / 4)];
		for (const axis of Object.values(AxisIndex).map(v => Number(v))) {
			this.extractSlice(axis, initSliceIndexes[axis], shallow);
		}
	}

	/**
	 * @member {Function} repaintAllSlices Call repaint on all the slices extracted from this volume
	 * @see VolumeSlice.repaint
	 * @memberof Volume
	 * @returns {Volume} this
	 */
	repaintAllSlices() {

		this.sliceList.forEach((slice) =>
			slice && slice.repaint()
		);
		return this;

	};

	/**
	 * @member {Function} computeMinMax Compute the minimum and the maximum of the data in the volume
	 * @memberof Volume
	 * @returns {Array} [min,max]
	 */
	computeMinMax() {

		let min = Infinity;
		let max = - Infinity;

		// buffer the length
		const datasize = this.data.length;

		let i = 0;

		for (i = 0; i < datasize; i++) {

			if (!isNaN(this.data[i])) {

				const value = this.data[i];
				min = Math.min(min, value);
				max = Math.max(max, value);

			}

		}

		this.min = min;
		this.max = max;
		this.windowLow = min;
		this.windowHigh = max;

		return [min, max];

	};
}

export { Volume };
