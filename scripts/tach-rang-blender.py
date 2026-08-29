# Tách một khối răng gộp thành 32 khối riêng và đặt tên theo mã FDI.
#
# VÌ SAO CẦN: bộ mẫu tải về thường chỉ có ba khối — nướu, hàm trên, hàm dưới.
# Khối gộp thì phần mềm không tô màu được từng răng và không bấm chọn được
# từng răng, tức là mất luôn lý do có màn 3D. Script này tách chúng ra và đặt
# tên đúng chuẩn để hệ thống tự nhận.
#
# CÁCH CHẠY
#   1. Mở Blender, mở tệp teeth.blend
#   2. Chuyển sang tab Scripting, mở tệp này, bấm Run Script
#   3. Xem cửa sổ System Console để biết nó tách được bao nhiêu răng
#   4. Kiểm mắt vài răng xem tên có khớp vị trí không, sửa tay nếu lệch
#   5. File → Export → glTF 2.0 (.glb), bật "Selected Objects" nếu cần
#
# LƯU Ý VỀ ĐẶT TÊN: script sắp răng theo TOẠ ĐỘ X rồi gán mã lần lượt. Nó đúng
# khi mẫu có đủ răng và xếp cân đối. Mẫu thiếu răng khôn, hoặc răng lệch nhiều,
# thì vài mã sẽ sai — phải kiểm mắt. Đặt sai mã còn tệ hơn không đặt: bác sĩ
# bấm vào răng 16 mà hệ thống ghi cho răng 17.
#
# GIẤY PHÉP CỦA MẪU: nếu dùng mẫu CC BY (như "Human Teeth" của b2przemo trên
# BlendSwap) thì BẮT BUỘC ghi công tác giả ở nơi người dùng thấy được. Đó là
# điều kiện của giấy phép, không phải phép lịch sự.

import bpy
from mathutils import Vector

# Mã FDI theo thứ tự từ TRÁI sang PHẢI trên màn hình, tức là nhìn đối diện
# bệnh nhân: bên phải bệnh nhân nằm bên trái hình.
HAM_TREN = ['18', '17', '16', '15', '14', '13', '12', '11',
            '21', '22', '23', '24', '25', '26', '27', '28']
HAM_DUOI = ['48', '47', '46', '45', '44', '43', '42', '41',
            '31', '32', '33', '34', '35', '36', '37', '38']


def tam_the_gioi(o):
    """Tâm khối trong toạ độ thế giới."""
    diem = [o.matrix_world @ Vector(c) for c in o.bound_box]
    return sum(diem, Vector()) / len(diem)


def tach_va_dat_ten(ten_goc, ma_rang, nhan):
    o = bpy.data.objects.get(ten_goc)
    if o is None:
        print(f'  BỎ QUA: không tìm thấy đối tượng "{ten_goc}"')
        return []

    bpy.ops.object.select_all(action='DESELECT')
    o.select_set(True)
    bpy.context.view_layer.objects.active = o

    # Tách theo mảnh rời. Răng trong mẫu thường là các vỏ riêng chưa hàn vào
    # nhau, nên cách này tách đúng từng cái.
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.mesh.separate(type='LOOSE')
    bpy.ops.object.mode_set(mode='OBJECT')

    manh = [x for x in bpy.context.selected_objects if x.type == 'MESH']
    manh.sort(key=lambda x: tam_the_gioi(x).x)

    print(f'  {nhan}: tách được {len(manh)} mảnh, cần {len(ma_rang)}')
    if len(manh) != len(ma_rang):
        print(f'    CẢNH BÁO: số mảnh khác số răng mong đợi. Kiểm mắt trước khi xuất.')

    ra = []
    for i, x in enumerate(manh):
        ma = ma_rang[i] if i < len(ma_rang) else f'?{i}'
        x.name = f'Tooth_{ma}'
        x.data.name = f'Mesh_{ma}'
        ra.append(x.name)
    return ra


print('\n═══ TÁCH RĂNG VÀ ĐẶT MÃ FDI ═══')
if bpy.context.object and bpy.context.object.mode != 'OBJECT':
    bpy.ops.object.mode_set(mode='OBJECT')

tren = tach_va_dat_ten('Teeth.upper', HAM_TREN, 'Hàm trên')
duoi = tach_va_dat_ten('Teeth.lower', HAM_DUOI, 'Hàm dưới')

nuou = bpy.data.objects.get('Gums')
if nuou:
    nuou.name = 'gum_arch'
    print('  Nướu: đổi tên thành "gum_arch" để hệ thống KHÔNG coi nó là răng')

print(f'\n  Tổng: {len(tren) + len(duoi)} răng đã đặt mã.')
print('  Bước tiếp: kiểm mắt vài răng, rồi File → Export → glTF 2.0 (.glb)')
print('  Nhớ ghi công tác giả mẫu nếu giấy phép là CC BY.\n')
