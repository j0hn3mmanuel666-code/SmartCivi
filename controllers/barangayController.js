import { Barangay, Resident } from '../models/index.js';
import { sequelize } from '../models/db.js';

export const listBarangays = async (req, res) => {
  try {
    const barangays = await Barangay.findAll({
      attributes: {
        include: [
          [
            sequelize.fn('COUNT', sequelize.col('Residents.id')),
            'residentCount'
          ]
        ]
      },
      include: [
        {
          model: Resident,
          as: 'Residents',
          attributes: [],
          where: { status: 'active' },
          required: false
        }
      ],
      group: ['Barangay.id'],
      order: [['name', 'ASC']]
    });

    res.render('barangays', { barangays });
  } catch (error) {
    console.error('Error listing barangays:', error);
    req.flash('error_msg', 'Error loading barangays');
    res.redirect('/dashboard');
  }
};
