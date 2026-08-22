// 레벨별 필요 경험치와 날짜 간 획득 경험치 계산을 담당합니다.
use sha2::{Digest, Sha256};

pub const EXP_TABLE_VERSION: &str = "kms-2026-03-19-v2";

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
    7_344_309_856,
    8_152_183_940,
    9_048_924_173,
    10_044_305_832,
    11_149_179_473,
    13_379_015_367,
    14_583_126_750,
    15_895_608_157,
    17_326_212_891,
    18_885_572_051,
    22_662_686_461,
    24_249_074_513,
    25_946_509_728,
    27_762_765_408,
    29_706_158_986,
    35_647_390_783,
    38_142_708_137,
    40_812_697_706,
    43_669_586_545,
    46_726_457_603,
    56_071_749_123,
    57_753_901_596,
    59_486_518_643,
    61_271_114_202,
    63_109_247_628,
    75_731_097_153,
    78_003_030_067,
    80_343_120_969,
    82_753_414_598,
    85_236_017_035,
    102_283_220_442,
    105_351_717_055,
    108_512_268_566,
    111_767_636_622,
    115_120_665_720,
    138_144_798_864,
    142_289_142_829,
    146_557_817_113,
    150_954_551_626,
    155_483_188_174,
    186_579_825_808,
    192_177_220_582,
    197_942_537_199,
    203_880_813_314,
    209_997_237_713,
    216_297_154_844,
    222_786_069_489,
    229_469_651_573,
    236_353_741_120,
    243_444_353_353,
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

pub fn calculate_progress_gap(
    primary_level: i64,
    primary_exp: i64,
    target_level: i64,
    target_exp: i64,
) -> ExpCalculation {
    if primary_exp < 0 || target_exp < 0 {
        return ExpCalculation::InvalidDecrease;
    }
    if primary_level == target_level {
        return match target_exp.checked_sub(primary_exp) {
            Some(value) => ExpCalculation::Ok(value),
            None => ExpCalculation::Overflow,
        };
    }
    let (calculation, target_is_ahead) = if target_level > primary_level {
        (
            calculate_gain(primary_level, primary_exp, target_level, target_exp),
            true,
        )
    } else {
        (
            calculate_gain(target_level, target_exp, primary_level, primary_exp),
            false,
        )
    };
    match calculation {
        ExpCalculation::Ok(value) if target_is_ahead => ExpCalculation::Ok(value),
        ExpCalculation::Ok(value) => match value.checked_neg() {
            Some(value) => ExpCalculation::Ok(value),
            None => ExpCalculation::Overflow,
        },
        other => other,
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

    #[test]
    fn progress_gap_includes_level_distance() {
        let required = required_exp(281).unwrap();
        assert_eq!(
            calculate_progress_gap(281, required - 100, 282, 25),
            ExpCalculation::Ok(125)
        );
        assert_eq!(
            calculate_progress_gap(282, 25, 281, required - 100),
            ExpCalculation::Ok(-125)
        );
    }

    #[test]
    fn current_kms_table_includes_2026_reduced_range() {
        assert_eq!(required_exp(210), Some(7_344_309_856));
        assert_eq!(required_exp(259), Some(243_444_353_353));
        assert_eq!(required_exp(260), Some(1_731_919_984_062));
    }
}
