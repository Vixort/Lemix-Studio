"""Build the bundled four-second graph; development only: pip install onnx.

Usage: python scripts/prepare-roformer.py path/to/verified-model.onnx
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
seconds = int(sys.argv[2]) if len(sys.argv) > 2 else 4
assert seconds in (4, 8)
frames = seconds * 100 + 1
raw = source.read_bytes()
definitions = {
    'bs_roformer_ep317_sdr12.9755_quantized_uint8.onnx': ('b86b6224ff34d6d34c2530e0d41495b6a2c12db46acc1a7a5c7f64d2352807e9', 'bs-roformer-viperx-t401.onnx'),
    'bs_roformer_ep317_sdr12.9755.onnx': ('357837834747cbf3cd680bfab33f9bfd08b99d493d8dfabc84b92e59e4fcfe73', 'bs-roformer-viperx-fp32-t401.onnx'),
    'mel_band_roformer_kim_T801.onnx': ('1b8afd7780d8a234527748821dee6bc746d346f2088751c12fd48e8c873f625a', 'mel-roformer-kim-t401.onnx'),
}
expected_hash, graph_name = definitions[source.name]
graph_name = graph_name.replace('t401', f't{frames}')
assert hashlib.sha256(raw).hexdigest() == expected_hash, 'Unexpected source model'
model = onnx.load_model_from_string(raw)
cursor = 0
changed = 0
def shorten(tensor):
    global changed
    if tensor.external_data:
        length = next(int(entry.value) for entry in tensor.external_data if entry.key == 'length')
        if 801 not in tensor.dims and length > 1024:
            return False
        external_data_helper.load_external_data_for_tensor(tensor, str(source.parent))
        tensor.ClearField('external_data')
        tensor.data_location = onnx.TensorProto.DEFAULT
    values = numpy_helper.to_array(tensor)
    if 801 in values.shape:
        selection = tuple(slice(0, frames) if size == 801 else slice(None) for size in values.shape)
        tensor.CopyFrom(numpy_helper.from_array(values[selection].copy(), tensor.name))
        changed += 1
        return True
    elif values.dtype.kind in 'iu' and values.size < 64 and (values == 801).any():
        values = values.copy()
        values[values == 801] = frames
        tensor.CopyFrom(numpy_helper.from_array(values, tensor.name))
        changed += 1
        return True
    return False

for tensor in model.graph.initializer:
    if not shorten(tensor) and len(tensor.raw_data) > 1024:
        blob = tensor.raw_data
        offset = raw.find(blob, cursor)
        if offset < 0:
            offset = raw.find(blob)
        assert offset >= 0
        cursor = offset + len(blob)
        external_data_helper.set_external_data(tensor, source.name, offset, len(blob))
        tensor.ClearField('raw_data')
for node in model.graph.node:
    for attribute in node.attribute:
        if attribute.type == onnx.AttributeProto.TENSOR:
            shorten(attribute.t)
assert changed >= 25, 'Unexpected model graph'
for value in [*model.graph.input, *model.graph.output]:
    for dim in value.type.tensor_type.shape.dim:
        if dim.dim_value == 801:
            dim.dim_value = frames
# Intermediate shapes contain products of the old time axis; let ORT infer them again.
model.graph.ClearField('value_info')
# The original FP32 export contains a few consumers before producers.
available = {value.name for value in model.graph.input} | {tensor.name for tensor in model.graph.initializer} | {''}
pending = list(model.graph.node)
ordered = []
while pending:
    remaining = []
    for node in pending:
        if all(name in available for name in node.input):
            ordered.append(node)
            available.update(node.output)
        else:
            remaining.append(node)
    assert len(remaining) < len(pending), 'Unresolved model inputs'
    pending = remaining
model.graph.ClearField('node')
model.graph.node.extend(ordered)
graph = model.SerializeToString()
temporary = source.with_name(graph_name)
temporary.write_bytes(graph)
onnx.checker.check_model(str(temporary))
compressed = io.BytesIO()
with gzip.GzipFile(filename='', fileobj=compressed, mode='wb', mtime=0) as stream:
    stream.write(graph)
target = Path(__file__).resolve().parents[1] / 'electron-assets' / f'{graph_name}.gz'
target.parent.mkdir(exist_ok=True)
target.write_bytes(compressed.getvalue())
print(f'{target.name}: {changed} time constants, {len(graph)} bytes, {len(compressed.getvalue())} compressed; SHA256 {hashlib.sha256(graph).hexdigest()}')
