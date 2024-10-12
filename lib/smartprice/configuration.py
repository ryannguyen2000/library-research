# -*- coding: utf-8 -*-

#tổng số phòng
totalRooms = 30

#tỉ lệ lấp đầy ngày thứ 3 trước check-in (ngày bình thường)
threeDaysBeforeRate = 0.0565

#tỉ lệ lấp đầy ngày thứ 2 trước check in (ngày bình thường)
twoDaysBeforeRate = 0.083

#tỉ lệ lấp đầy ngày cuối trước check-in (ngày bình thường)
oneDaysBeforeRate = 0.13

#tỉ lệ lấp đầy của ngày check-in (ngày bình thường) 
#tổng cộng
zeroDaysBeforeRateT = 0.13

#đo theo giờ
zeroDaysBeforeRate = [
    ([0, 3], 0.01817),
    ([3, 6], 0.01397),
    ([6, 9], 0.02795),
    ([9, 12], 0.03075),
    ([12, 15], 0.01258),
    ([15, 18], 0.00978),
    ([18, 21], 0.00280),
    ([21, 24], 0.01398),
]

#trending của ngày đó
trend = 1.0

#maximum promotion (tỉ lệ khuyến mãi tối đa)
maxPromotion = 0.5

#minumum promotion (tỉ lệ khuyến mãi tối thiểu)
minPromotion = 0.0

#hệ số elasticity (luôn là số âm -2, -3, -3.6)
elasticity = -3.6
