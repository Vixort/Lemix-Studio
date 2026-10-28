"""Build the bundled four-second graph; development only: pip install onnx.

Usage: python scripts/prepare-roformer.py path/to/verified-uint8.onnx
Weights stay in the original downloaded file, addressed by byte offset.
"""
import gzip
import hashlib
import io
from pathlib import Path
import sys

import onnx
from onnx import external_data_helper, numpy_helper

source = Path(sys.argv[1])
raw = source.read_bytes()
assert hashlib.sha256(raw).hexdigest() == 'b86b6224ff34d6d34c2530e0d41495b6a2c12db46acc1a7a5c7f64d2352807e9', 'Unexpected source model'
assert source.name == 'bs_roformer_ep317_sdr12.9755_quantized_uint8.onnx'
model = onnx.load_model_from_string(raw)
cursor = 0
changed = 0
for tensor in model.graph.initializer:
    values = numpy_helper.to_array(tensor)
    if tensor.name == 'einsum':
        assert list(values.shape) == [801, 32]
        tensor.CopyFrom(numpy_helper.from_array(values[:401].copy(), tensor.name))
        changed += 1
    elif values.dtype.kind in 'iu' and values.size < 64 and (values == 801).any():
        values = values.copy()
        values[values == 801] = 401
        tensor.CopyFrom(numpy_helper.from_array(values, tensor.name))
        changed += 1
    elif len(tensor.raw_data) > 1024:
        blob = tensor.raw_data
        offset = raw.find(blob, cursor)
        if offset < 0:
            offset = raw.find(blob)
        assert offset >= 0
        cursor = offset + len(blob)
        external_data_helper.set_external_data(tensor, source.name, offset, len(blob))
        tensor.ClearField('raw_data')
assert changed == 25, 'Unexpected model graph'
for value in [*model.graph.input, *model.graph.output]:
    for dim in value.type.tensor_type.shape.dim:
        if dim.dim_value == 801:
            dim.dim_value = 401
# Intermediate shapes contain products of the old time axis; let ORT infer them again.
model.graph.ClearField('value_info')
graph = model.SerializeToString()
temporary = source.with_name('bs-roformer-viperx-t401.onnx')
temporary.write_bytes(graph)
onnx.checker.check_model(str(temporary))
compressed = io.BytesIO()
with gzip.GzipFile(filename='', fileobj=compressed, mode='wb', mtime=0) as stream:
    stream.write(graph)
target = Path(__file__).resolve().parents[1] / 'electron-assets' / 'bs-roformer-viperx-t401.onnx.gz'
target.parent.mkdir(exist_ok=True)
target.write_bytes(compressed.getvalue())
print(f'{target.name}: {len(graph)} bytes, {len(compressed.getvalue())} compressed; SHA256 {hashlib.sha256(graph).hexdigest()}')
