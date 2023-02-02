# vol-renderer


A npm package to display NIfTI volume (based on ThreeJs)

<div align="center">
  <img src="docs/vol-renderer_preview.png">
</div>


<br/><br/>

## Try the online [demo](https://cau-riken.github.io/vol-renderer/demo/index.html).

<br/><br/>

## Usage

In the consuming project, add a line to your `.npmrc` file so this package can be retrieved from github package registry :

```.rc
@cau-riken:registry=https://npm.pkg.github.com
```

And if not already done, you'll also need to include a personal token with `read:packages` scope to be able to install packages from github registry:
```.rc
//npm.pkg.github.com/:_authToken=<REPLACE_BY_YOUR_TOKEN>'
```

(References: [authenticating to github packages](https://docs.github.com/en/packages/learn-github-packages/introduction-to-github-packages#authenticating-to-github-packages) and [create a personal (classic) token](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/creating-a-personal-access-token#creating-a-personal-access-token-classic))

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


