// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// Licensed under the Apache License, Version 2.0 (the "License"). You may not use this file except in compliance
// with the License. A copy of the License is located at
//
// http://aws.amazon.com/apache2.0/
//
// or in the "LICENSE.txt" file accompanying this file. This file is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES
// OR CONDITIONS OF ANY KIND, express or implied. See the License for the specific language governing permissions and
// limitations under the License.

import {useState} from '../store'
import {featureFlagsProvider} from './featureFlagsProvider'
import {AvailableFeature} from './types'

export function useFeatureFlag(feature: AvailableFeature): boolean {
  const version = useState(['app', 'wizard', 'version'])
  const region = useState(['aws', 'region'])
  return isFeatureEnabled(version, region, feature)
}

export function isFeatureEnabled(
  version: string,
  region: string,
  feature: AvailableFeature,
): boolean {
  const features = new Set(featureFlagsProvider(version, region))
  const enabled = features.has(feature)
  if (!enabled) {
    console.log(`FEATURE FLAG: Feature ${feature} is disabled`)
  }
  return enabled
}
