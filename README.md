# vol-renderer

## build (locally)



## Usage

In the consuming project, add a line to your `.npmrc` file so this package can be retrieve from github package repository :

```.rc
@cau-riken:registry=https://npm.pkg.github.com
```

### Install package

```sh
npm install @cau-riken/vol-renderer
```

### Import package and use in your code

```javascript

import 'normalize.css';

....

import { VolumeRenderer } from "@cau-riken/vol-renderer";

import "@cau-riken/vol-renderer/dist/main.css";

....

    <VolumeRenderer
        url='resources/Marmoset_T2WI.nii.gz'
        inlineControls={true}
    />


```
