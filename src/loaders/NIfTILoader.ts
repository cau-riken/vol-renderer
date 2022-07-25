import {
	FileLoader,
	Loader,
	LoadingManager,
	Matrix4,

	UnsignedByteType,
	ShortType,
	IntType,
	FloatType,
	ByteType,
	UnsignedShortType,
	UnsignedIntType,

	Quaternion,
	Vector3,

} from 'three';

//import { Volume } from 'three/examples/jsm/misc/Volume.js';
import { AxisIndex, Volume } from '../misc/Volume';

import * as Nifti from "nifti-reader-js";
import { rowArrayToMatrix4 } from '../components/Utils';

class NIfTILoader extends Loader {

	constructor(manager?: LoadingManager) {
		super(manager);
	}

	load(
		url: string,
		onLoad: (v: Volume) => void,
		onProgress?: (request: ProgressEvent) => void,
		onError?: (event: ErrorEvent) => void,
	) {

		const scope = this;

		const loader = new FileLoader(scope.manager);
		loader.setPath(scope.path);
		loader.setResponseType('arraybuffer');
		loader.setRequestHeader(scope.requestHeader);
		loader.setWithCredentials(scope.withCredentials);
		loader.load(url, function (data) {

			try {

				onLoad(scope.parse(data as ArrayBuffer, onError));

			} catch (e) {

				if (onError) {

					onError(e);

				} else {

					console.error(e);

				}

				scope.manager.itemError(url);

			}

		}, onProgress, onError);

	}

	parse(_data: ArrayBuffer, onError?: (event: ErrorEvent) => void): Volume {


		const getDataType = (dataTypeCode: number) => {


			switch (dataTypeCode) {
				case Nifti.NIFTI1.TYPE_UINT8:
					return Uint8Array;
				case Nifti.NIFTI1.TYPE_INT16:
					return Int16Array;
				case Nifti.NIFTI1.TYPE_INT32:
					return Int32Array;
				case Nifti.NIFTI1.TYPE_FLOAT32:
					return Float32Array;
				case Nifti.NIFTI1.TYPE_FLOAT64:
					return Float64Array;

				/*! 3x8 bytes. */
				//case Nifti.NIFTI1.TYPE_RGB24:
				//    return Int8Array;

				case Nifti.NIFTI1.TYPE_INT8:
					return Int8Array;
				case Nifti.NIFTI1.TYPE_UINT16:
					return Uint16Array;
				case Nifti.NIFTI1.TYPE_UINT32:
					return Uint32Array;

				/*! signed long long. */
				//case Nifti.NIFTI1.TYPE_INT64:
				//    return Float64Array;
				/*! unsigned long long. */
				//case Nifti.NIFTI1.TYPE_UINT64:
				//    return Float64Array;
				default:
					return null;


			}
		};


		const getThreeDataType = (dataTypeCode: number) => {


			switch (dataTypeCode) {
				case Nifti.NIFTI1.TYPE_UINT8:
					return UnsignedByteType;
				case Nifti.NIFTI1.TYPE_INT16:
					return ShortType;
				case Nifti.NIFTI1.TYPE_INT32:
					return IntType;
				case Nifti.NIFTI1.TYPE_FLOAT32:
					//return HalfFloatType;
					return FloatType;
				case Nifti.NIFTI1.TYPE_FLOAT64:
					return FloatType;
				/*
				export const UnsignedShort4444Type = 1017;
				export const UnsignedShort5551Type = 1018;
				export const UnsignedShort565Type = 1019;
				export const UnsignedInt248Type = 1020;
				*/

				/*! 3x8 bytes. */
				//case Nifti.NIFTI1.TYPE_RGB24:
				//    return Int8Array;

				case Nifti.NIFTI1.TYPE_INT8:
					return ByteType;
				case Nifti.NIFTI1.TYPE_UINT16:
					return UnsignedShortType;
				case Nifti.NIFTI1.TYPE_UINT32:
					return UnsignedIntType;

				/*! signed long long. */
				//case Nifti.NIFTI1.TYPE_INT64:
				//    return Float64Array;
				/*! unsigned long long. */
				//case Nifti.NIFTI1.TYPE_UINT64:
				//    return Float64Array;
				default:
					return null;

			}
		};

		type AffineTransformInfo = {
			//type of transform as specified by in qform_code or sform_code
			//( Nifti.NIFTI1.XFORM_SCANNER_ANAT | XFORM_ALIGNED_ANAT | XFORM_TALAIRACH | XFORM_MNI_152 )
			transformType: number,
			//rotation/reflection matrix (no scaling/translation)
			affine: Matrix4,
			//spacing between slices in RAS space (in mm)
			spacings: number[],
		}

		const infoUsingMethod2 = (niftiHeader, lengthFactor: number) => {
			let result: AffineTransformInfo | undefined;
			if (niftiHeader.qform_code > 0) {
				//NIfTI header doesn't contain affine matrix, must use Q-form params instead to create the matrix

				//should be either -1 or 1, any different value treated as 1
				const qfac = niftiHeader.pixDims[0] === -1 ? -1 : 1;
				//FIXME not using qfac
				(qfac === -1) && console.error("qfac was -1");

				/*
				const adjust = new Matrix4().set(
					1, 0, qfac, 0,
					0, 1, qfac, 0,
					0, 0, qfac, 0,
					0, 0, 0, 1);
					*/

				const [b, c, d] = [niftiHeader.quatern_b, niftiHeader.quatern_c, niftiHeader.quatern_d];
				const a = Math.sqrt(1.0 - (b * b + c * c + d * d));

				const affine = new Matrix4()
					.makeRotationFromQuaternion(new Quaternion(a, b, c, d));

				//FIXME not using position offsets
				//const pos = new Vector3(niftiHeader.qoffset_x, niftiHeader.qoffset_y, niftiHeader.qoffset_z);
				//affine.setPosition(pos);

				//reset offset
				affine.setPosition(0, 0, 0);

				//spacings between slices readily available from the header (just convert to mm)
				const spacings = niftiHeader.pixDims.slice(1, 4).map(s => s * lengthFactor);

				result = { affine, spacings, transformType: niftiHeader.qform_code };
			}
			return result;
		};

		const infoUsingMethod2bis = (niftiHeader, lengthFactor: number) => {
			let result: AffineTransformInfo | undefined;
			if (niftiHeader.qform_code > 0) {

				//https://github.com/Kitware/ITK/blob/master/Modules/IO/NIFTI/src/itkNiftiImageIO.cxx

				let a = 0.0;
				let b = niftiHeader.quatern_b, c = niftiHeader.quatern_c, d = niftiHeader.quatern_d;
				let xd = 1.0, yd = 1.0, zd = 1.0;
				const qx = niftiHeader.qoffset_x, qy = niftiHeader.qoffset_y, qz = niftiHeader.qoffset_z;

				// compute a
				a = 1.0 - (b * b + c * c + d * d);
				if (a < 0.0000001) {                   /* special case */
					a = 1.0 / Math.sqrt(b * b + c * c + d * d);
					b *= a; c *= a; d *= a;        /* normalize (b,c,d) vector */
					a = 0.0;                       /* a = 0 ==> 180 degree rotation */

				} else {
					a = Math.sqrt(a);                     /* angle = 2*arccos(a) */
				}

				// scaling factors
				if (niftiHeader.pixDims[1] > 0.0) {
					xd = niftiHeader.pixDims[1];
				}

				if (niftiHeader.pixDims[2] > 0.0) {
					yd = niftiHeader.pixDims[2];
				}

				if (niftiHeader.pixDims[2] > 0.0) {
					zd = niftiHeader.pixDims[3];
				}

				// qfac left handed
				if (niftiHeader.pixDims[0] < 0.0) {
					zd = -zd;
				}

				// fill IJKToRAS
				const affine = new Matrix4().set(
					(a * a + b * b - c * c - d * d) * xd,
					2 * (b * c - a * d) * yd,
					2 * (b * d + a * c) * zd,
					qx,

					2 * (b * c + a * d) * xd,
					(a * a + c * c - b * b - d * d) * yd,
					2 * (c * d - a * b) * zd,
					qy,

					2 * (b * d - a * c) * xd,
					2 * (c * d + a * b) * yd,
					(a * a + d * d - c * c - b * b) * zd,
					qz,

					0, 0, 0, 1

				);

				const org = new Vector3(0, 0, 0).applyMatrix4(affine);
				const unit = new Vector3(1, 1, 1).applyMatrix4(affine);
				const spacings = unit.sub(org).toArray().map(s => Math.abs(s));
				const rescale = new Vector3(...(spacings.map(s => 1 / s)));

				affine.scale(rescale);

				//FIXME not using position offsets
				//reset offset
				affine.setPosition(0, 0, 0);


				result = { affine, spacings, transformType: niftiHeader.qform_code };
			}
			return result;
		};

		const infoUsingMethod3 = (niftiHeader, lengthFactor: number) => {
			let result: AffineTransformInfo | undefined;
			if (niftiHeader.sform_code > 0) {
				//NIfTI header contains transform matrix
				const headerAffine = rowArrayToMatrix4(niftiHeader.affine);

				const affine = new Matrix4()
					.extractRotation(headerAffine);

				//FIXME not using position offsets
				//const pos = new Vector3().setFromMatrixPosition(niftiHeader.affine);
				//affine.setPosition(pos);

				//pixdim from header not used in this method (see https://nifti.nimh.nih.gov/pub/dist/src/niftilib/nifti1.h )
				const spacings0 = [Math.abs(niftiHeader.affine[0][0]), Math.abs(niftiHeader.affine[1][1]), Math.abs(niftiHeader.affine[2][2])];

				const org = new Vector3(0, 0, 0).applyMatrix4(headerAffine);
				const unit = new Vector3(1, 1, 1).applyMatrix4(headerAffine);
				const spacings = unit.sub(org).toArray().map(s => Math.abs(s))
					.map(s => s * lengthFactor);

				result = { affine, spacings, transformType: niftiHeader.sform_code };
			}
			return result;
		};


		// .. let's use the underlying array buffer
		let data = _data;
		let volume;

		if (Nifti.isCompressed(data)) {
			data = Nifti.decompress(data);
		}

		if (Nifti.isNIFTI(data)) {
			const niftiHeader = Nifti.readHeader(data);
			//console.log(niftiHeader);
			console.log(niftiHeader.toFormattedString());

			//Convention: in the viewer, drawing space is assumed to be RAS space using millimeters as length unit.
			const spatialUnit = Nifti.NIFTI1.SPATIAL_UNITS_MASK & niftiHeader.xyzt_units;
			const lengthFactor =
				(spatialUnit === Nifti.NIFTI1.UNITS_MM)
					? 1 :
					(spatialUnit === Nifti.NIFTI1.UNITS_METER)
						? 1000 :
						(spatialUnit === Nifti.NIFTI1.UNITS_MICRON)
							? 0.001
							: //should not happen
							1;

			console.log('lengthFactor', lengthFactor);
			//
			const dimensions = [niftiHeader.dims[1], niftiHeader.dims[2], niftiHeader.dims[3]];
			let spacings: number[];
			let affine: Matrix4;

			//NIfTI header can specify affine transform  in one of three ways
			//see https://nifti.nimh.nih.gov/pub/dist/src/niftilib/nifti1.h
			const infoMethod2b = infoUsingMethod2bis(niftiHeader, lengthFactor);
			const infoMethod2 = infoUsingMethod2(niftiHeader, lengthFactor);
			const infoMethod3 = infoUsingMethod3(niftiHeader, lengthFactor);

			if (infoMethod2 || infoMethod3) {

				let preferredMethod: AffineTransformInfo | undefined;;
				if (infoMethod2 && typeof infoMethod3 === 'undefined') {
					preferredMethod = infoMethod2;
				} else if (infoMethod3 && typeof infoMethod2 === 'undefined') {
					preferredMethod = infoMethod3;
				} else {
					//both S-form and Q-form are defined
					preferredMethod = infoMethod3;

				}
				console.log('infoMethod2.0', infoMethod2b);
				console.log('infoMethod2', infoMethod2);
				console.log('infoMethod3', infoMethod3);

				(preferredMethod === infoMethod2) ?
					console.log('METHOD 2 [Q-form] - "normal" case')
					:
					console.log("METHOD 3 [S-form]");

				affine = preferredMethod.affine;
				spacings = preferredMethod.spacings;


			} else if (niftiHeader.qform_code === 0) {
				console.log('METHOD 1 - "old way"');

				//No orientation specified in the header, world coordinates are determined simply by scaling by the voxel size
				affine = new Matrix4().identity();
				/*
				set(
					niftiHeader.pixDims[1], 0, 0, 0,
					0, niftiHeader.pixDims[2], 0, 0, 
					0, 0, niftiHeader.pixDims[3], 0,
					0, 0, 0, 1
				);
				*/

				//spacings between slices are voxel sizes specified in the header 
				spacings = niftiHeader.pixDims.slice(1, 4).map(s => s * lengthFactor);

			} else {
				//should not happen
				const errorInitEvent: ErrorEventInit = {
					error: new Error('NIFTIParseError'),
					message: 'Unable to process this NIfTI file',
					lineno: 0,
					colno: 0,
					filename: ''
				};

				onError && onError(new ErrorEvent('NIFTILoadError', errorInitEvent));
				return;
			}


			const niftiImage = Nifti.readImage(niftiHeader, data);
			/*
			if (Nifti.hasExtension(niftiHeader)) {
				const niftiExt = Nifti.readExtensionData(niftiHeader, data);
			}
			*/

			/*
						console.debug("Units Code = " + niftiHeader.xyzt_units
							+ " (" + niftiHeader.getUnitsCodeString(Nifti.NIFTI1.SPATIAL_UNITS_MASK & niftiHeader.xyzt_units)
							+ ", " + niftiHeader.getUnitsCodeString(Nifti.NIFTI1.TEMPORAL_UNITS_MASK & niftiHeader.xyzt_units) + ")\n");
			*/

			volume = new Volume();

			const datatype = getDataType(niftiHeader.datatypeCode);
			if (datatype) {
				volume.datatype = datatype;
				volume.data = new datatype(niftiImage);
				volume.threeDataType = getThreeDataType(niftiHeader.datatypeCode);

				// get the min and max intensities
				const min_max = volume.computeMinMax();
				const min = min_max[0];
				const max = min_max[1];

				// get the image dimensions

				//FIXME limited to 3 space dimensions (not time)
				const nbDimension = Math.min(niftiHeader.dims[0], 3)
				//FIXME Assume 3 space dimensions here...

				console.log('affine:', affine);
				console.log('affine rot:', new Matrix4().extractRotation(affine));


				//Width of the volume in the IJK coordinate system
				volume.xLength = dimensions[AxisIndex.X];
				//Height of the volume in the IJK coordinate system
				volume.yLength = dimensions[AxisIndex.Y];
				//Depth of the volume in the IJK coordinate system
				volume.zLength = dimensions[AxisIndex.Z];

				//--------------------------------------

				// spacing
				volume.spacing = spacings;
				console.log('vol spacing:', volume.spacing);

				// IJK to RAS and invert
				volume.matrix = affine;

				volume.inverseMatrix = volume.matrix.clone().invert();

				//dimensions of the volume in the RAS space
				volume.RASDimensions = [dimensions[AxisIndex.X] * spacings[AxisIndex.X], dimensions[AxisIndex.Y] * spacings[AxisIndex.Y], dimensions[AxisIndex.Z] * spacings[AxisIndex.Z]];
				console.log('RASDimensions', volume.RASDimensions);


				//FIXME volume.offset seems to be unused 


			}

		}
		return volume;
	}


}


export { NIfTILoader };
