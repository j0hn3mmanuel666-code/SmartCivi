import { Barangay, Resident } from '../models/index.js';

export const listBarangays = async (req, res) => {
  try {
    const barangays = await Barangay.findAll({
      order: [['name', 'ASC']]
    });

    const residents = await Resident.findAll({
      attributes: ['barangay_id', 'status']
    });

    const barangayList = barangays.map(b => {
      const bResidents = residents.filter(r => r.barangay_id === b.id);
      const activeCount = bResidents.filter(r => r.status === 'active').length;
      const archivedCount = bResidents.filter(r => r.status === 'archived').length;
      const totalCount = bResidents.length;
      return {
        id: b.id,
        name: b.name,
        description: b.description,
        activeCount,
        archivedCount,
        totalCount
      };
    });

    const barangayCount = barangayList.length;
    const totalActiveResidents = barangayList.reduce((sum, b) => sum + b.activeCount, 0);
    const totalResidents = barangayList.reduce((sum, b) => sum + b.totalCount, 0);

    res.render('barangays', {
      barangays: barangayList,
      barangayCount,
      totalActiveResidents,
      totalResidents
    });
  } catch (error) {
    console.error('Error listing barangays:', error);
    req.flash('error_msg', 'Error loading barangays');
    res.redirect('/dashboard');
  }
};
