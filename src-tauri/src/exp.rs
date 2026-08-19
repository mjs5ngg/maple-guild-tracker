// 레벨별 필요 경험치와 날짜 간 획득 경험치 계산을 담당합니다.
use sha2::{Digest, Sha256};

pub const EXP_TABLE_VERSION: &str = "kms-new-age-2023-06-15-v1";

const EXP_200_TO_299: [i64; 100] = [
    2_207_026_470,
    2_471_869_646,
    2_768_494_003,
    3_100_713_283,
    3_472_798_876,
    3_889_534_741,
    4_356_278_909,
    4_879_032_378,
    5_464_516_263,
    6_120_258_214,
    7_956_335_678,
    8_831_532_602,
    9_803_001_188,
    10_881_331_318,
    12_078_277_762,
    15_701_761_090,
    17_114_919_588,
    18_655_262_350,
    20_334_235_961,
    22_164_317_197,
    28_813_612_356,
    30_830_565_220,
    32_988_704_785,
    35_297_914_119,
    37_768_768_107,
    49_099_398_539,
    52_536_356_436,
    56_213_901_386,
    60_148_874_483,
    64_359_295_696,
    83_667_084_404,
    86_177_096_936,
    88_762_409_844,
    91_425_282_139,
    94_168_040_603,
    122_418_452_783,
    126_091_006_366,
    129_873_736_556,
    133_769_948_652,
    137_783_047_111,
    179_117_961_244,
    184_491_500_081,
    190_026_245_083,
    195_727_032_435,
    201_598_843_408,
    262_078_496_430,
    269_940_851_322,
    278_039_076_861,
    286_380_249_166,
    294_971_656_640,
    442_457_484_960,
    455_731_209_508,
    469_403_145_793,
    483_485_240_166,
    497_989_797_370,
    512_929_491_291,
    528_317_376_029,
    544_166_897_309,
    560_491_904_228,
    577_306_661_354,
    1_731_919_984_062,
    1_749_239_183_902,
    1_766_731_575_741,
    1_784_398_891_498,
    1_802_242_880_412,
    2_342_915_744_535,
    2_366_344_901_980,
    2_390_008_350_999,
    2_413_908_434_508,
    2_438_047_518_853,
    5_412_465_491_853,
    5_466_590_146_771,
    5_521_256_048_238,
    5_576_468_608_720,
    5_632_233_294_807,
    11_377_111_255_510,
    12_514_822_381_061,
    13_766_304_619_167,
    15_142_935_081_083,
    16_657_228_589_191,
    33_647_601_750_165,
    37_012_361_925_181,
    40_713_598_117_699,
    44_784_957_929_468,
    49_263_453_722_414,
    99_512_176_519_276,
    109_463_394_171_203,
    120_409_733_588_323,
    132_450_706_947_155,
    145_695_777_641_870,
    294_305_470_836_577,
    323_736_017_920_234,
    356_109_619_712_257,
    391_720_581_683_482,
    430_892_639_851_830,
    870_403_132_500_696,
    957_443_445_750_765,
    1_053_187_790_325_841,
    1_158_506_569_358_425,
    1_737_759_854_037_637,
];

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ExpCalculation {
    Ok(i64),
    MissingTable,
    InvalidDecrease,
    Overflow,
}

pub fn required_exp(level: i64) -> Option<i64> {
    if (200..=299).contains(&level) {
        EXP_200_TO_299.get((level - 200) as usize).copied()
    } else {
        None
    }
}

pub fn calculate_gain(
    from_level: i64,
    from_exp: i64,
    to_level: i64,
    to_exp: i64,
) -> ExpCalculation {
    if from_level > to_level || from_exp < 0 || to_exp < 0 {
        return ExpCalculation::InvalidDecrease;
    }
    if from_level == to_level {
        return if to_exp >= from_exp {
            ExpCalculation::Ok(to_exp - from_exp)
        } else {
            ExpCalculation::InvalidDecrease
        };
    }

    let Some(first_required) = required_exp(from_level) else {
        return ExpCalculation::MissingTable;
    };
    if from_exp > first_required {
        return ExpCalculation::InvalidDecrease;
    }

    let mut total = match first_required.checked_sub(from_exp) {
        Some(value) => value,
        None => return ExpCalculation::Overflow,
    };
    for level in (from_level + 1)..to_level {
        let Some(required) = required_exp(level) else {
            return ExpCalculation::MissingTable;
        };
        total = match total.checked_add(required) {
            Some(value) => value,
            None => return ExpCalculation::Overflow,
        };
    }
    match total.checked_add(to_exp) {
        Some(value) => ExpCalculation::Ok(value),
        None => ExpCalculation::Overflow,
    }
}

pub fn table_checksum() -> String {
    let mut hasher = Sha256::new();
    for value in EXP_200_TO_299 {
        hasher.update(value.to_le_bytes());
    }
    format!("{:x}", hasher.finalize())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn same_level_gain_is_difference() {
        assert_eq!(calculate_gain(260, 10, 260, 42), ExpCalculation::Ok(32));
    }

    #[test]
    fn unchanged_exp_is_zero() {
        assert_eq!(calculate_gain(260, 42, 260, 42), ExpCalculation::Ok(0));
    }

    #[test]
    fn one_level_up_includes_remaining_exp() {
        let required = required_exp(260).unwrap();
        assert_eq!(
            calculate_gain(260, required - 100, 261, 25),
            ExpCalculation::Ok(125)
        );
    }

    #[test]
    fn multiple_level_ups_include_intermediate_level() {
        let required = required_exp(260).unwrap();
        let middle = required_exp(261).unwrap();
        assert_eq!(
            calculate_gain(260, required - 100, 262, 25),
            ExpCalculation::Ok(100 + middle + 25)
        );
    }

    #[test]
    fn exp_decrease_is_not_silently_calculated() {
        assert_eq!(
            calculate_gain(260, 50, 260, 49),
            ExpCalculation::InvalidDecrease
        );
    }

    #[test]
    fn unsupported_level_requires_table_update() {
        assert_eq!(calculate_gain(199, 0, 200, 0), ExpCalculation::MissingTable);
    }
}
